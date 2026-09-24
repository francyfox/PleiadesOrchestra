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
	widget: {
		maxTextChars: config.WIDGET_MAX_TEXT_CHARS,
		messagesPerMinute: config.WIDGET_MESSAGES_PER_MINUTE,
		ipMessagesPerMinute: config.WIDGET_IP_MESSAGES_PER_MINUTE,
		visitorsPerHourPerIp: config.WIDGET_VISITORS_PER_HOUR_PER_IP,
		trustProxy: config.TRUST_PROXY,
		tokenTtlHours: config.ANON_RETENTION_HOURS,
		retentionPerUser: config.MESSAGE_RETENTION_PER_USER,
	},
	onError: (error) => console.error("Persistence error:", error),
}).listen(config.PORT);

const stopCleanup = scheduleAnonymousCleanup(
	db,
	config.ANON_RETENTION_HOURS,
	(error) => console.error("Anonymous cleanup failed:", error),
);

const signals = ["SIGINT", "SIGTERM"];

for (const signal of signals) {
	process.on(signal, () => {
		console.log(`Received ${signal}. Shutting down...`);
		stopCleanup();
		app.stop();
		usageRecorder.flush();
		db.$client.close();
		process.exit(0);
	});
}

process.on("uncaughtException", (error) => {
	console.error("Uncaught exception:", error);
});

process.on("unhandledRejection", (error) => {
	console.error("Unhandled rejection:", error);
});

console.log(`harness listening on :${config.PORT}`);
