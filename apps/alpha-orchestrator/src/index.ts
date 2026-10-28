import { withChoiceReport } from "@repo/core";
import { createObservability, serve } from "@repo/elysia-kit";
import { createApp } from "./app.ts";
import { agentSettings } from "./modules/agent-settings/agent-settings.instance.ts";
import {
	AGENT_MAX_HISTORY_MESSAGES,
	agent,
	productRequestAgent,
} from "./modules/agents/agents.instance.ts";
import {
	translateWithAlpha,
	understandAgent,
} from "./modules/alpha-understand/alpha-understand.instance.ts";
import { channelDirectory } from "./modules/channel-directory/channel-directory.instance.ts";
import { config } from "./modules/config/config.service.ts";
import { db } from "./modules/database/database.instance.ts";
import { decisionAgent } from "./modules/decisions/decisions.instance.ts";
import { withEnglishOnly } from "./modules/english-only/english-only.ts";
import { functionCallAgent } from "./modules/function-calls/function-calls.instance.ts";
import { historyStore } from "./modules/history/history.instance.ts";
import { markInterruptedRuns } from "./modules/plan-runs/plan-runs.service.ts";
import { priceBook } from "./modules/prices/prices.instance.ts";
import { assertRetentionCoversHistory } from "./modules/retention/retention.service.ts";
import { startRetentionJobs } from "./modules/retention/retention.ts";
import { runs } from "./modules/run-binding/run-binding.instance.ts";
import { usageRecorder } from "./modules/usage-recorder/usage-recorder.instance.ts";
import { backfillVisitorNames } from "./modules/visitors/visitors.service.ts";
import { startWaitingRunsJob } from "./modules/waiting-runs/waiting-runs.ts";
import { SqliteWorldStateStore } from "./modules/world-state/world-state.ts";

// Local evals (`albedo eval`) ask the models this service really uses; only reachable through `docker compose exec`.
if (process.argv[2] === "agent:settings") {
	console.log(
		JSON.stringify({
			decision: agentSettings.effective("gamma-decision"),
			functionCall: agentSettings.effective("delta-function-call"),
			understand: agentSettings.effective("alpha-understand"),
		}),
	);
	process.exit(0);
}

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

const app = createApp({
	agent,
	// Laya reads English only: whatever still is not (a Russian site's tool
	// descriptions and enum values) is translated by alpha-understand, or the call is refused.
	// Laya's probabilities are refitted on our own data (`bun run calibrate` in
	// packages/core) in decisions.instance, so every consumer sees calibrated ones.
	// Outermost, so the ledger gets the callers' own option keys and calibrated probabilities.
	decisionAgent: withChoiceReport(
		withEnglishOnly(decisionAgent, { translate: translateWithAlpha }),
	),
	decisionModel: () => {
		const { provider, model } = agentSettings.effective("gamma-decision");
		return { provider: provider ?? "laya", model };
	},
	layaAutoApproveConfidence: config.LAYA_AUTO_APPROVE_CONFIDENCE,
	productRequestAgent,
	functionCallAgent,
	understandAgent,
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
			const understand = agentSettings.effective("alpha-understand");
			return [
				{
					id: "beta-text",
					name: "beta-text",
					role: "text" as const,
					baseUrl: text.baseUrl,
					model: text.model,
				},
				{
					id: "alpha-understand",
					name: "alpha-understand",
					role: "understand" as const,
					baseUrl: understand.baseUrl,
					model: understand.model,
				},
				{
					id: "gamma-decision",
					name: "gamma-decision",
					role: "decision" as const,
					baseUrl: laya.baseUrl,
					model: laya.model,
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

markInterruptedRuns(db);

const stopWaitingRunsJob = startWaitingRunsJob(
	db,
	reportError("waiting_runs_failed"),
);

serve(app, {
	port: config.PORT,
	maxRequestBodySize: config.HTTP_MAX_BODY_BYTES,
	observability,
	onShutdown: () => {
		stopRetentionJobs();
		stopWaitingRunsJob();
		usageRecorder.flush();
		db.$client.close();
	},
});
