import { createObservability, serve } from "@repo/elysia-kit";
import { AGENT_MAX_HISTORY_MESSAGES, agent } from "./agent.ts";
import { scheduleAnonymousCleanup } from "./db/cleanup.ts";
import { channels, db, runs, usageRecorder } from "./db/instance.ts";
import { decisionAgent } from "./decision-agent.ts";
import { config } from "./env.ts";
import { assertRetentionCoversHistory } from "./retention.ts";
import { createApp } from "./server.ts";

// Migrations already ran when ./db/instance.ts opened the database.
assertRetentionCoversHistory(
	config.MESSAGE_RETENTION_PER_USER,
	AGENT_MAX_HISTORY_MESSAGES,
);

const observability = createObservability("alpha-orchestrator", config);
const { logger, monitoring } = observability;

/** Persistence and background failures: logged and reported, never fatal to a request. */
function report(message: string) {
	return (error: unknown) => {
		logger.error({
			message,
			"error.message": error instanceof Error ? error.message : String(error),
		});
		monitoring.capture(error, { source: message });
	};
}

const app = createApp({
	agent,
	decisionAgent,
	apiKey: config.HARNESS_API_KEY,
	adminApiKey: config.ADMIN_API_KEY,
	maxChunkChars: config.HARNESS_MAX_CHUNK_CHARS,
	db,
	channels,
	runs,
	usageRecorder,
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
		],
	},
	widget: {
		maxTextChars: config.WIDGET_MAX_TEXT_CHARS,
		messagesPerMinute: config.WIDGET_MESSAGES_PER_MINUTE,
		ipMessagesPerMinute: config.WIDGET_IP_MESSAGES_PER_MINUTE,
		visitorsPerHourPerIp: config.WIDGET_VISITORS_PER_HOUR_PER_IP,
		trustProxy: config.TRUST_PROXY,
		tokenTtlHours: config.ANON_RETENTION_HOURS,
		retentionPerUser: config.MESSAGE_RETENTION_PER_USER,
	},
	onError: report("persistence_error"),
	observability,
});

const stopCleanup = scheduleAnonymousCleanup(
	db,
	config.ANON_RETENTION_HOURS,
	report("anonymous_cleanup_failed"),
);

serve(app, {
	port: config.PORT,
	observability,
	onShutdown: () => {
		stopCleanup();
		usageRecorder.flush();
		db.$client.close();
	},
});
