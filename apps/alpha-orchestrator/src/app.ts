import type {
	Agent,
	DecisionAgent,
	FunctionCallAgent,
	GoapAction,
	HistoryStore,
	RunLock,
	UsageRecorder,
	WorldStateStore,
} from "@repo/core";
import { createRunLock, InMemoryWorldStateStore } from "@repo/core";
import {
	createKitApp,
	createObservability,
	type Observability,
	onRequestGuard,
} from "@repo/elysia-kit";
import { resolveTaxonomy } from "@repo/intent-presets";
import { Elysia } from "elysia";
import { accessRoutes } from "./modules/access/access.ts";
import { accountBillingRoutes } from "./modules/account-billing/account-billing.ts";
import { ActiveRuns } from "./modules/active-runs/active-runs.ts";
import type { AgentSettings } from "./modules/agent-settings/agent-settings.service.ts";
import { agentSettingsRoutes } from "./modules/agent-settings/agent-settings.ts";
import type { AgentSpec, FetchLike } from "./modules/agents/agents.service.ts";
import { agentsRoutes } from "./modules/agents/agents.ts";
import { authorizeRequest } from "./modules/auth/auth.service.ts";
import type { BillingProducts } from "./modules/billing/billing.service.ts";
import { billingRoutes } from "./modules/billing/billing.ts";
import { blockedIpsRoutes } from "./modules/blocked-ips/blocked-ips.ts";
import type { ChannelDirectory } from "./modules/channel-directory/channel-directory.ts";
import {
	channelsRoutes,
	ownerChannelsRoutes,
} from "./modules/channels/channels.ts";
import { completionsRoutes } from "./modules/completions/completions.ts";
import type { Db } from "./modules/database/database.ts";
import { decisionsRoutes } from "./modules/decisions/decisions.ts";
import { financeRoutes } from "./modules/finance/finance.ts";
import { buildActions } from "./modules/goap/goap.service.ts";
import { HOUR_MS } from "./modules/http/http.service.ts";
import { identifyRoutes } from "./modules/identify/identify.ts";
import { IntentMemory } from "./modules/intents/intents.service.ts";
import { intentsRoutes } from "./modules/intents/intents.ts";
import { LruMap } from "./modules/lru-map/lru-map.ts";
import { mcpRoutes } from "./modules/mcp/mcp.ts";
import { messagesRoutes } from "./modules/messages/messages.ts";
import { performanceRoutes } from "./modules/performance/performance.ts";
import { getPersona } from "./modules/persona/persona.service.ts";
import { personaRoutes } from "./modules/persona/persona.ts";
import type { PriceBook } from "./modules/prices/prices.service.ts";
import { ReplyService } from "./modules/reply/reply.ts";
import { requestsRoutes } from "./modules/requests/requests.ts";
import type { RunBinding } from "./modules/run-binding/run-binding.ts";
import { statsRoutes } from "./modules/stats/stats.ts";
import { subscriptionsRoutes } from "./modules/subscriptions/subscriptions.ts";
import { threadsRoutes } from "./modules/threads/threads.ts";
import { usageRoutes } from "./modules/usage/usage.ts";
import { visitorsRoutes } from "./modules/visitors/visitors.ts";
import {
	DEFAULT_WIDGET_OPTIONS,
	type WidgetOptions,
	widgetRoutes,
} from "./modules/widget/widget.ts";

export type { WidgetOptions } from "./modules/widget/widget.ts";

export interface AppDeps {
	/** Comma-separated origins allowed to reach /v1/admin/requests/* from a browser. */
	adminCorsOrigins?: string;
	agent: Agent;
	decisionAgent: DecisionAgent;
	/** See `ReplyDeps.layaAutoApproveConfidence`; unset = Laya's intents always wait for a person. */
	layaAutoApproveConfidence?: number;
	/** Extracts `{query, quantity}` from a shopping message; optional (tests leave it out). */
	productRequestAgent?: Agent;
	/** Russian → English for a message as it comes in (Opus-MT, ~30 ms); unset = the text stays as typed. */
	translate?: (text: string) => string | Promise<string>;
	/** Writes the JSON arguments of WebMCP tool calls; without it they are built from the run's facts. */
	functionCallAgent?: FunctionCallAgent;
	/** Transport secret (telegram-bot, cli, integration backends). */
	apiKey: string;
	/** Separate secret for /v1/admin/* (apps/admin-api). */
	adminApiKey: string;
	maxChunkChars: number;
	db: Db;
	channels: ChannelDirectory;
	/** Shared with the history store / usage recorder so their writes get linked to the running plan. */
	runs: RunBinding;
	/** Where a templated reply is stored like a model's would be (the same store the agent writes to). */
	historyStore?: HistoryStore;
	/** Flushed once a message's stream is done — `SqliteUsageRecorder` in production. */
	usageRecorder?: { flush(): void; record?: UsageRecorder["record"] };
	/**
	 * Persists a thread's `WorldState` across `runPlan` calls so a run that
	 * stopped short of its goal resumes on the thread's next message.
	 * In-memory (lost on restart) when unset; `SqliteWorldStateStore` in production.
	 */
	worldStateStore?: WorldStateStore;
	/** Serializes `runPlan` calls on one thread. In-memory default: fine for a single instance. */
	runLock?: RunLock;
	/** Runs executing right now; shared with `/v1/admin/requests`. In-memory default. */
	activeRuns?: ActiveRuns;
	/** Extra actions for one thread, resolved per request (e.g. an MCP catalog tied to a live session). */
	threadActionsFor?: (threadId: string) => Promise<GoapAction[]> | GoapAction[];
	/** Classified WebMCP actions per thread; in-memory default, lost on restart (the widget re-registers). */
	webmcpCatalog?: Map<string, GoapAction[]>;
	ipHashSalt: string;
	/** Agents listed (and health-probed) by `GET /v1/admin/agents`; a function is re-read on every call (settings change without a restart). */
	agents?: { specs: AgentSpec[] | (() => AgentSpec[]); fetch?: FetchLike };
	/** Per-agent model settings; without it the settings routes are not mounted. */
	agentSettings?: AgentSettings;
	/** OpenRouter model prices for the usage spend; unset = spend is `null`. */
	prices?: PriceBook;
	/** Polar webhook receiver; without it `POST /v1/billing/polar` does not exist (404). */
	billing?: { webhookSecret: string } & BillingProducts;
	/** Prefix of a subscription's page in Polar's dashboard (`<it>/<id>`); unset = no link in the panel. */
	polarDashboardUrl?: string;
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
	const actions = buildActions(
		deps.agent,
		deps.maxChunkChars,
		deps.historyStore,
		(channelId) => deps.channels.replyPrompt(channelId),
	);
	const activeRuns = deps.activeRuns ?? new ActiveRuns();
	const intentMemory = new IntentMemory(deps.db);
	const widgetOptions = { ...DEFAULT_WIDGET_OPTIONS, ...deps.widget };
	const reply = new ReplyService({
		db: deps.db,
		agent: deps.agent,
		decisionAgent: deps.decisionAgent,
		productRequestAgent: deps.productRequestAgent,
		translate: deps.translate,
		intentMemory,
		layaAutoApproveConfidence: deps.layaAutoApproveConfidence,
		catalogLanguage: (channelId) =>
			deps.channels.byId(channelId)?.catalogLanguage,
		intentSets: (channelId) =>
			deps.channels.byId(channelId)?.intentSets ?? ["shop"],
		severalTasks: (channelId) =>
			deps.channels.byId(channelId)?.severalTasks ?? false,
		// shortcut: a channel with no set still takes its tools' dependencies (a search
		// before an id-based add) from the shop preset; read them from the tools' schemas
		// instead when a second domain needs it.
		taxonomy: (channelId) =>
			resolveTaxonomy(
				deps.channels.byId(channelId)?.intentSets.length
					? (deps.channels.byId(channelId)?.intentSets ?? [])
					: ["shop"],
			),
		functionCallAgent: deps.functionCallAgent,
		personaLang: (channelId) => getPersona(deps.db, channelId).defaultLang,
		history: deps.historyStore,
		actions,
		runs: deps.runs,
		worldStateStore: deps.worldStateStore ?? new InMemoryWorldStateStore(),
		runLock: deps.runLock ?? createRunLock(),
		activeRuns,
		webmcpCatalog:
			deps.webmcpCatalog ??
			new LruMap({
				maxEntries: widgetOptions.maxCatalogThreads,
				ttlMs: widgetOptions.tokenTtlHours * HOUR_MS,
				now,
			}),
		threadActionsFor: deps.threadActionsFor,
		usageRecorder: deps.usageRecorder,
		now,
		onError: deps.onError,
	});

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
				description:
					"Runs the GOAP planner over small local models. Transports use `HARNESS_API_KEY`, `/v1/admin/*` uses `ADMIN_API_KEY` + `X-Admin-Id`, `/v1/widget/*` a channel's publishable key and visitor token.",
				path: "/swagger",
				security: "bearer",
				tags: [
					{
						name: "Transport",
						description:
							"Bots and CLIs (`HARNESS_API_KEY`): access check, messages, threads, decisions.",
					},
					{
						name: "Widget",
						description:
							"The web chat widget on a site (publishable key, visitor token, `Origin` allowlist) and server-to-server identify.",
					},
					{
						name: "Billing",
						description: "Polar webhook (only with `POLAR_WEBHOOK_SECRET`).",
					},
					{
						name: "Admin: visitors",
						description: "Chat visitors: list, whitelist, block, messages.",
					},
					{
						name: "Admin: channels",
						description: "Channels and their persona (reply prompt).",
					},
					{ name: "Admin: blocked IPs" },
					{
						name: "Admin: intents",
						description: "Laya's intent answers waiting for an admin verdict.",
					},
					{
						name: "Admin: requests",
						description:
							"Flow requests: GOAP runs with steps, tools and model calls.",
					},
					{
						name: "Admin: usage & stats",
						description:
							"Model calls ledger, dashboard numbers, latency percentiles.",
					},
					{
						name: "Admin: subscriptions",
						description: "Polar subscriptions and their channels.",
					},
					{
						name: "Admin: MCP",
						description: "WebMCP tool catalogs the sites announced.",
					},
					{
						name: "Admin: agents",
						description:
							"Model agents: health, settings, providers file, provider keys.",
					},
				],
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
			.use(
				deps.agentSettings
					? completionsRoutes({
							settings: deps.agentSettings,
							agent: "beta-text",
						})
					: new Elysia(),
			)
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
			.use(
				deps.billing
					? billingRoutes({
							db,
							webhookSecret: deps.billing.webhookSecret,
							products: deps.billing,
							now,
							onAccountChanged: (accountId) =>
								directory.refreshStanding(accountId),
							log: (message) => observability.logger.info({ message }),
						})
					: new Elysia(),
			)
			// Admin routes
			.use(visitorsRoutes({ db, now }))
			.use(channelsRoutes({ db, directory, now }))
			.use(ownerChannelsRoutes({ db, directory }))
			.use(personaRoutes({ db, directory, now }))
			.use(blockedIpsRoutes({ db, ipHashSalt: deps.ipHashSalt, now }))
			.use(intentsRoutes({ db, memory: intentMemory, now }))
			.use(usageRoutes({ db, now, prices: deps.prices }))
			.use(financeRoutes({ db, now, prices: deps.prices }))
			.use(statsRoutes({ db, now }))
			.use(performanceRoutes({ db, now }))
			.use(
				requestsRoutes({
					db,
					activeRuns,
					now,
					corsOrigins: new Set(
						(deps.adminCorsOrigins ?? "https://shalotts.site")
							.split(",")
							.map((s) => s.trim())
							.filter(Boolean),
					),
				}),
			)
			.use(
				subscriptionsRoutes({
					db,
					now,
					polarBaseUrl: deps.polarDashboardUrl,
				}),
			)
			.use(
				accountBillingRoutes({
					db,
					now,
					prices: deps.prices,
					polarBaseUrl: deps.polarDashboardUrl,
				}),
			)
			.use(mcpRoutes(db))
			.use(agentsRoutes({ agents: deps.agents, now, db }))
			.use(
				deps.agentSettings
					? agentSettingsRoutes({ settings: deps.agentSettings })
					: new Elysia(),
			)
	);
}
