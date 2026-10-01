import type {
	Agent,
	DecisionAgent,
	GoapAction,
	RunLock,
	WorldStateStore,
} from "@repo/core";
import { createRunLock, InMemoryWorldStateStore } from "@repo/core";
import {
	createKitApp,
	createObservability,
	type Observability,
	onRequestGuard,
} from "@repo/elysia-kit";
import { accessRoutes } from "./modules/access/access.ts";
import type { AgentSpec, FetchLike } from "./modules/agents/agents.service.ts";
import { agentsRoutes } from "./modules/agents/agents.ts";
import { authorizeRequest } from "./modules/auth/auth.service.ts";
import { blockedIpsRoutes } from "./modules/blocked-ips/blocked-ips.ts";
import type { ChannelDirectory } from "./modules/channel-directory/channel-directory.ts";
import { channelsRoutes } from "./modules/channels/channels.ts";
import type { Db } from "./modules/database/database.ts";
import { decisionsRoutes } from "./modules/decisions/decisions.ts";
import { buildActions } from "./modules/goap/goap.service.ts";
import { goapRoutes } from "./modules/goap/goap.ts";
import { identifyRoutes } from "./modules/identify/identify.ts";
import { messagesRoutes } from "./modules/messages/messages.ts";
import { performanceRoutes } from "./modules/performance/performance.ts";
import { planRunsRoutes } from "./modules/plan-runs/plan-runs.ts";
import { ReplyService } from "./modules/reply/reply.ts";
import type { RunBinding } from "./modules/run-binding/run-binding.ts";
import { statsRoutes } from "./modules/stats/stats.ts";
import { threadsRoutes } from "./modules/threads/threads.ts";
import { usageRoutes } from "./modules/usage/usage.ts";
import { usersRoutes } from "./modules/users/users.ts";
import {
	DEFAULT_WIDGET_OPTIONS,
	type WidgetOptions,
	widgetRoutes,
} from "./modules/widget/widget.ts";

export type { WidgetOptions } from "./modules/widget/widget.ts";

export interface AppDeps {
	agent: Agent;
	decisionAgent: DecisionAgent;
	/** Transport secret (telegram-bot, cli, integration backends). */
	apiKey: string;
	/** Separate secret for /v1/admin/* (apps/admin-api). */
	adminApiKey: string;
	maxChunkChars: number;
	db: Db;
	channels: ChannelDirectory;
	/** Shared with the history store / usage recorder so their writes get linked to the running plan. */
	runs: RunBinding;
	/** Flushed once a message's stream is done — `SqliteUsageRecorder` in production. */
	usageRecorder?: { flush(): void };
	/**
	 * Persists a thread's `WorldState` across `runPlan` calls so a run that
	 * stopped short of its goal resumes on the thread's next message.
	 * In-memory (lost on restart) when unset; `SqliteWorldStateStore` in production.
	 */
	worldStateStore?: WorldStateStore;
	/** Serializes `runPlan` calls on one thread. In-memory default: fine for a single instance. */
	runLock?: RunLock;
	/** Extra actions for one thread, resolved per request (e.g. an MCP catalog tied to a live session). */
	threadActionsFor?: (threadId: string) => Promise<GoapAction[]> | GoapAction[];
	/** Classified WebMCP actions per thread; in-memory default, lost on restart (the widget re-registers). */
	webmcpCatalog?: Map<string, GoapAction[]>;
	ipHashSalt: string;
	/** Agents listed (and health-probed) by `GET /v1/admin/agents`. */
	agents?: { specs: AgentSpec[]; fetch?: FetchLike };
	/** Widget limits and settings; unset fields use `DEFAULT_WIDGET_OPTIONS`. */
	widget?: Partial<WidgetOptions>;
	now?: () => number;
	/** Where persistence errors after a response go; they never break the stream. */
	onError?: (error: unknown) => void;
	/** Logger + error monitoring; tests omit it and get a silent one. */
	observability?: Observability;
}

/**
 * Builds the Elysia app from its controllers. Kept apart from index.ts so
 * tests can call `app.handle(request)` without a listening port or a real model.
 */
export function createApp(deps: AppDeps) {
	const now = deps.now ?? Date.now;
	const actions = buildActions(deps.agent, deps.maxChunkChars);
	const reply = new ReplyService({
		db: deps.db,
		agent: deps.agent,
		decisionAgent: deps.decisionAgent,
		actions,
		runs: deps.runs,
		worldStateStore: deps.worldStateStore ?? new InMemoryWorldStateStore(),
		runLock: deps.runLock ?? createRunLock(),
		webmcpCatalog: deps.webmcpCatalog ?? new Map(),
		threadActionsFor: deps.threadActionsFor,
		usageRecorder: deps.usageRecorder,
		now,
		onError: deps.onError,
	});
	const widgetOptions = { ...DEFAULT_WIDGET_OPTIONS, ...deps.widget };

	const observability =
		deps.observability ??
		createObservability("alpha-orchestrator", { LOG_LEVEL: "silent" });
	const { db } = deps;
	const directory = deps.channels;

	return (
		createKitApp({
			observability,
			// Docs are unauthenticated so the API is discoverable (e.g. by the
			// Chrome extension) without a token in hand yet.
			docs: {
				title: "alpha-orchestrator",
				path: "/swagger",
				security: "bearer",
			},
		})
			.onRequest(
				onRequestGuard(observability.logger, (request) =>
					authorizeRequest(request, {
						apiKey: deps.apiKey,
						adminApiKey: deps.adminApiKey,
					}),
				),
			)
			// Transport routes
			.use(accessRoutes({ db, directory, now }))
			.use(messagesRoutes({ db, directory, reply, now }))
			.use(threadsRoutes({ db, directory, agent: deps.agent }))
			.use(decisionsRoutes(deps.decisionAgent))
			// Public widget routes
			.use(
				widgetRoutes({
					db,
					directory,
					ipHashSalt: deps.ipHashSalt,
					now,
					options: widgetOptions,
					reply,
				}),
			)
			.use(
				identifyRoutes({
					db,
					directory,
					retentionPerUser: widgetOptions.retentionPerUser,
					now,
				}),
			)
			// Admin routes
			.use(usersRoutes({ db, now }))
			.use(channelsRoutes({ db, directory, now }))
			.use(blockedIpsRoutes({ db, ipHashSalt: deps.ipHashSalt, now }))
			.use(usageRoutes({ db, now }))
			.use(statsRoutes({ db, now }))
			.use(performanceRoutes({ db, now }))
			.use(planRunsRoutes(db))
			.use(goapRoutes({ db, actions }))
			.use(agentsRoutes({ agents: deps.agents, now }))
	);
}
