import { createObservability, serve } from "@repo/elysia-kit";
import { createApp } from "./app.ts";
import { agentSettings } from "./modules/agent-settings/agent-settings.instance.ts";
import {
	AGENT_MAX_HISTORY_MESSAGES,
	agent,
	productRequestAgent,
} from "./modules/agents/agents.instance.ts";
import { channelDirectory } from "./modules/channel-directory/channel-directory.instance.ts";
import { config } from "./modules/config/config.service.ts";
import { db } from "./modules/database/database.instance.ts";
import { decisionAgent } from "./modules/decisions/decisions.instance.ts";
import { withEnglishOnly } from "./modules/english-only/english-only.ts";
import { functionCallAgent } from "./modules/function-calls/function-calls.instance.ts";
import { historyStore } from "./modules/history/history.instance.ts";
import { priceBook } from "./modules/prices/prices.instance.ts";
import { assertRetentionCoversHistory } from "./modules/retention/retention.service.ts";
import { startRetentionJobs } from "./modules/retention/retention.ts";
import { runs } from "./modules/run-binding/run-binding.instance.ts";
import {
	loadTranslator,
	translatorModel,
} from "./modules/translate/translate.instance.ts";
import { usageRecorder } from "./modules/usage-recorder/usage-recorder.instance.ts";
import { backfillVisitorNames } from "./modules/visitors/visitors.service.ts";
import { SqliteWorldStateStore } from "./modules/world-state/world-state.ts";

// Migrations already ran when database.instance.ts opened the database.
backfillVisitorNames(db);
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

const translate = async (text: string) =>
	(await translator?.translate(text)) ?? "";

const app = createApp({
	translate,
	agent,
	// Laya reads English only: whatever still is not (a Russian site's tool
	// descriptions and enum values) is translated here, or the call is refused.
	// Laya's probabilities are refitted on our own data (`bun run calibrate` in
	// packages/core) in decisions.instance, so every consumer sees calibrated ones.
	decisionAgent: withEnglishOnly(decisionAgent, { translate }),
	layaAutoApproveConfidence: config.LAYA_AUTO_APPROVE_CONFIDENCE,
	productRequestAgent,
	functionCallAgent,
	apiKey: config.HARNESS_API_KEY,
	adminApiKey: config.ADMIN_API_KEY,
	adminCorsOrigins: config.ADMIN_CORS_ORIGINS,
	maxChunkChars: config.HARNESS_MAX_CHUNK_CHARS,
	db,
	channels: channelDirectory,
	runs,
	usageRecorder,
	historyStore,
	worldStateStore: new SqliteWorldStateStore(db),
	ipHashSalt: config.IP_HASH_SALT,
	agentSettings,
	prices: priceBook,
	billing: config.POLAR_WEBHOOK_SECRET
		? {
				webhookSecret: config.POLAR_WEBHOOK_SECRET,
				creditsProductId: config.POLAR_CREDITS_PRODUCT_ID,
				planProductId: config.POLAR_PLAN_PRODUCT_ID,
			}
		: undefined,
	polarDashboardUrl: config.POLAR_DASHBOARD_URL,
	agents: {
		// A function: the models behind the agents change without a restart.
		specs: () => {
			const text = agentSettings.effective("beta-text");
			const laya = agentSettings.effective("gamma-decision");
			const delta = agentSettings.effective("delta-function-call");
			return [
				{
					id: "beta-text",
					name: "beta-text",
					role: "text" as const,
					baseUrl: text.baseUrl,
					model: text.model,
				},
				{
					id: "gamma-decision",
					name: "gamma-decision",
					role: "decision" as const,
					baseUrl: laya.baseUrl,
					model: laya.model,
				},
				{
					id: "translate",
					name: "Opus-MT translator",
					role: "translate" as const,
					baseUrl: "",
					model: translatorModel().repo,
					ready: translator !== undefined,
				},
				...(delta.baseUrl
					? [
							{
								id: "delta-function-call",
								name: "delta-function-call",
								role: "function-call" as const,
								baseUrl: delta.baseUrl,
								model: delta.model,
							},
						]
					: []),
			];
		},
	},
	widget: {
		maxTextChars: config.WIDGET_MAX_TEXT_CHARS,
		maxWebmcpToolsChars: config.WIDGET_MAX_WEBMCP_TOOLS_CHARS,
		maxBodyBytes: config.WIDGET_MAX_BODY_BYTES,
		threadsPerHour: config.WIDGET_THREADS_PER_HOUR,
		maxCatalogThreads: config.WIDGET_MAX_CATALOG_THREADS,
		messagesPerMinute: config.WIDGET_MESSAGES_PER_MINUTE,
		ipMessagesPerMinute: config.WIDGET_IP_MESSAGES_PER_MINUTE,
		toolResultsPerMinute: config.WIDGET_TOOL_RESULTS_PER_MINUTE,
		visitorsPerHourPerIp: config.WIDGET_VISITORS_PER_HOUR_PER_IP,
		clientIpSource: config.CLIENT_IP_SOURCE,
		trustedProxyHops: config.TRUSTED_PROXY_HOPS,
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
	maxRequestBodySize: config.HTTP_MAX_BODY_BYTES,
	observability,
	onShutdown: () => {
		translator?.close();
		stopRetentionJobs();
		usageRecorder.flush();
		db.$client.close();
	},
});
