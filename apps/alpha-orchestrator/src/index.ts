import { createObservability, serve } from "@repo/elysia-kit";
import { createApp } from "./app.ts";
import {
	AGENT_MAX_HISTORY_MESSAGES,
	agent,
	productRequestAgent,
} from "./modules/agents/agents.instance.ts";
import { channelDirectory } from "./modules/channel-directory/channel-directory.instance.ts";
import { config } from "./modules/config/config.service.ts";
import { db } from "./modules/database/database.instance.ts";
import { decisionAgent } from "./modules/decisions/decisions.instance.ts";
import { functionCallAgent } from "./modules/function-calls/function-calls.instance.ts";
import { historyStore } from "./modules/history/history.instance.ts";
import { assertRetentionCoversHistory } from "./modules/retention/retention.service.ts";
import { startRetentionJobs } from "./modules/retention/retention.ts";
import { runs } from "./modules/run-binding/run-binding.instance.ts";
import { loadTranslator } from "./modules/translate/translate.instance.ts";
import { usageRecorder } from "./modules/usage-recorder/usage-recorder.instance.ts";
import { SqliteWorldStateStore } from "./modules/world-state/world-state.ts";

// Migrations already ran when database.instance.ts opened the database.
assertRetentionCoversHistory(
	config.MESSAGE_RETENTION_PER_USER,
	AGENT_MAX_HISTORY_MESSAGES,
);

const observability = createObservability("alpha-orchestrator", config);
const { logger, monitoring } = observability;

/** Persistence and background failures: logged and reported, never fatal to a request. */
function reportError(message: string) {
	return (error: unknown) => {
		logger.error({
			message,
			"error.message": error instanceof Error ? error.message : String(error),
		});
		monitoring.capture(error, { source: message });
	};
}

// Loaded in the background: the first start downloads ~150 MB, and the service
// must answer meanwhile. Messages that arrive before it is ready simply go on
// untranslated (an empty answer means "no translation").
let translator: Awaited<ReturnType<typeof loadTranslator>>;
void loadTranslator(reportError("translator_unavailable")).then((loaded) => {
	translator = loaded;
	if (loaded) logger.info({ message: "translator ready" });
});

const app = createApp({
	translate: (text) => translator?.translate(text) ?? "",
	agent,
	decisionAgent,
	productRequestAgent,
	functionCallAgent,
	apiKey: config.HARNESS_API_KEY,
	adminApiKey: config.ADMIN_API_KEY,
	maxChunkChars: config.HARNESS_MAX_CHUNK_CHARS,
	db,
	channels: channelDirectory,
	runs,
	usageRecorder,
	historyStore,
	worldStateStore: new SqliteWorldStateStore(db),
	ipHashSalt: config.IP_HASH_SALT,
	agents: {
		specs: [
			{
				id: "beta-text",
				name: "beta-text",
				role: "text",
				baseUrl: config.LLM_BASE_URL,
				model: config.LLM_MODEL,
			},
			{
				id: "gamma-decision",
				name: "gamma-decision",
				role: "decision",
				baseUrl: config.LAYA_API_BASE_URL,
				model: null,
			},
			...(config.FUNCTION_CALL_BASE_URL
				? [
						{
							id: "delta-function-call",
							name: "delta-function-call",
							role: "function-call" as const,
							baseUrl: config.FUNCTION_CALL_BASE_URL,
							model: config.FUNCTION_CALL_MODEL,
						},
					]
				: []),
		],
	},
	widget: {
		maxTextChars: config.WIDGET_MAX_TEXT_CHARS,
		maxWebmcpToolsChars: config.WIDGET_MAX_WEBMCP_TOOLS_CHARS,
		messagesPerMinute: config.WIDGET_MESSAGES_PER_MINUTE,
		ipMessagesPerMinute: config.WIDGET_IP_MESSAGES_PER_MINUTE,
		visitorsPerHourPerIp: config.WIDGET_VISITORS_PER_HOUR_PER_IP,
		trustProxy: config.TRUST_PROXY,
		tokenTtlHours: config.ANON_RETENTION_HOURS,
		retentionPerUser: config.MESSAGE_RETENTION_PER_USER,
	},
	onError: reportError("persistence_error"),
	observability,
});

const stopRetentionJobs = startRetentionJobs(db, {
	anonymousRetentionHours: config.ANON_RETENTION_HOURS,
	worldStateRetentionHours: config.WORLD_STATE_RETENTION_HOURS,
	onError: reportError,
});

serve(app, {
	port: config.PORT,
	observability,
	onShutdown: () => {
		translator?.close();
		stopRetentionJobs();
		usageRecorder.flush();
		db.$client.close();
	},
});
