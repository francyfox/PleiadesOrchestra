import { retryFetch } from "@repo/elysia-kit";
import type {
	Agent,
	AgentPick,
	AgentSettingsView,
	AgentTestResult,
	Provider,
	ProviderInput,
	ProviderModel,
	ProvidersCheck,
	ProvidersText,
} from "../agents/agents.schema.ts";
import type { AccountBilling } from "../billing/billing.schema.ts";
import type {
	BlockedIp,
	CreateBlockedIpInput,
} from "../blocked-ips/blocked-ips.schema.ts";
import type {
	AccessMode,
	Channel,
	Persona,
	PersonaView,
	UpdateChannelInput,
} from "../channels/channels.schema.ts";
import type { PageQuery } from "../common/common.schema.ts";
import type { Finance } from "../finance/finance.schema.ts";
import type {
	IntentExample,
	IntentsPage,
	IntentsQuery,
	IntentVerdictInput,
} from "../intents/intents.schema.ts";
import type { UpstreamMcpSites } from "../mcp/mcp.schema.ts";
import type { PerformanceReport } from "../performance/performance.schema.ts";
import type {
	RequestsPage,
	RequestsQuery,
	UpstreamRequestDetails,
} from "../requests/requests.schema.ts";
import type { Stats } from "../stats/stats.schema.ts";
import type {
	PlanStatus,
	Subscription,
} from "../subscriptions/subscriptions.schema.ts";
import type { UsageGroupBy, UsageRow } from "../usage/usage.schema.ts";
import type {
	BulkAction,
	Visitor,
	VisitorDetails,
	VisitorsPage,
	VisitorsQuery,
} from "../visitors/visitors.schema.ts";

export class OrchestratorError extends Error {
	override name = "OrchestratorError";
	constructor(
		readonly status: number,
		message: string,
	) {
		super(message);
	}
}

/** What the orchestrator's `POST /v1/admin/channels` takes: web channels only, every field explicit. */
export interface NewChannel {
	slug: string;
	name: string;
	kind: "web";
	accessMode: AccessMode;
	allowedOrigins: string[];
	/** Left out = the orchestrator's default, English. */
	catalogLanguage?: string;
	/** Intent sets, in order; left out = none. */
	intentSets?: string[];
	/** Account that owns the channel; left out = staff-owned. */
	ownerId?: string;
}

export interface OrchestratorClientConfig {
	baseUrl: string;
	apiKey: string;
	fetch?: typeof fetch;
}

type Query = Record<string, string | number | undefined>;

/** Drops empty values so the orchestrator applies its own defaults. */
function toSearch(query: Query): string {
	const params = new URLSearchParams();
	for (const [key, value] of Object.entries(query)) {
		if (value === undefined || value === "") continue;
		params.set(key, String(value));
	}
	const search = params.toString();
	return search ? `?${search}` : "";
}

const segment = encodeURIComponent;

/**
 * Server-only client for the orchestrator's `/v1/admin/*` API
 * (apps/docs/content/en/drafts/admin-api.md). Reads need only the admin key; mutations go through
 * `.as(adminId)` so every write carries `X-Admin-Id` for the audit fields.
 */
export function createOrchestratorClient(config: OrchestratorClientConfig) {
	const baseUrl = config.baseUrl.replace(/\/+$/, "");
	// Reads and idempotent writes survive an orchestrator restart / blip; POSTs are never retried.
	const fetchFn = config.fetch ?? retryFetch();

	async function request<T>(
		method: string,
		path: string,
		options: { body?: unknown; adminId?: string } = {},
	): Promise<T> {
		const headers: Record<string, string> = {
			authorization: `Bearer ${config.apiKey}`,
		};
		if (options.adminId) headers["x-admin-id"] = options.adminId;
		if (options.body !== undefined)
			headers["content-type"] = "application/json";

		let response: Response;
		try {
			response = await fetchFn(`${baseUrl}${path}`, {
				method,
				headers,
				body:
					options.body === undefined ? undefined : JSON.stringify(options.body),
			});
		} catch (cause) {
			// Network-level failure (orchestrator down) — same error type as an
			// HTTP failure, so pages can show it instead of crashing with a 500.
			throw new OrchestratorError(
				503,
				`${method} ${path}: orchestrator unreachable (${cause instanceof Error ? cause.message : String(cause)})`,
			);
		}
		if (!response.ok) {
			throw new OrchestratorError(
				response.status,
				`${method} ${path} failed: ${response.status} ${response.statusText}`,
			);
		}
		if (response.status === 204) return undefined as T;
		return (await response.json()) as T;
	}

	const reads = {
		listVisitors: (query: VisitorsQuery) =>
			request<VisitorsPage>(
				"GET",
				`/v1/admin/visitors${toSearch({ ...query })}`,
			),
		/** `ownerId` set = 404 unless the visitor is in that account's channel. */
		getVisitor: (id: string, ownerId?: string) =>
			request<VisitorDetails>(
				"GET",
				`/v1/admin/visitors/${segment(id)}${toSearch({ ownerId })}`,
			),
		usage: (query: {
			groupBy: UsageGroupBy;
			from?: number;
			to?: number;
			channel?: string;
			ownerId?: string;
		}) =>
			request<{ rows: UsageRow[] }>("GET", `/v1/admin/usage${toSearch(query)}`),
		finance: (query: { from?: number; to?: number } = {}) =>
			request<Finance>("GET", `/v1/admin/finance${toSearch(query)}`),
		stats: (ownerId?: string) =>
			request<Stats>("GET", `/v1/admin/stats${toSearch({ ownerId })}`),
		performance: (query: { from?: number; to?: number } = {}) =>
			request<PerformanceReport>(
				"GET",
				`/v1/admin/performance${toSearch(query)}`,
			),
		listRequests: (query: RequestsQuery = {}) =>
			request<RequestsPage>(
				"GET",
				`/v1/admin/requests${toSearch({ ...query })}`,
			),
		/** `ownerId` set = 404 unless the request is from that account's channel. */
		getRequest: (id: string, ownerId?: string) =>
			request<UpstreamRequestDetails>(
				"GET",
				`/v1/admin/requests/${segment(id)}${toSearch({ ownerId })}`,
			),
		listMcp: () => request<UpstreamMcpSites>("GET", "/v1/admin/mcp"),
		listChannels: (query: PageQuery & { ownerId?: string } = {}) =>
			request<{ items: Channel[]; total: number }>(
				"GET",
				`/v1/admin/channels${toSearch({ ...query })}`,
			),
		getPersona: (channelId: string) =>
			request<PersonaView>(
				"GET",
				`/v1/admin/channels/${segment(channelId)}/persona`,
			),
		listIntents: (query: IntentsQuery = {}) =>
			request<IntentsPage>("GET", `/v1/admin/intents${toSearch({ ...query })}`),
		listBlockedIps: (query: PageQuery & { ownerId?: string } = {}) =>
			request<{ items: BlockedIp[]; total: number }>(
				"GET",
				`/v1/admin/blocked-ips${toSearch({ ...query })}`,
			),
		listAgents: () => request<{ items: Agent[] }>("GET", "/v1/admin/agents"),
		getAgentSettings: (id: string) =>
			request<AgentSettingsView>("GET", `/v1/admin/agents/${segment(id)}`),
		listSubscriptions: (
			query: { status?: PlanStatus; accountId?: string } = {},
		) =>
			request<{ items: Subscription[] }>(
				"GET",
				`/v1/admin/subscriptions${toSearch(query)}`,
			),
		getAccountBilling: (accountId: string) =>
			request<AccountBilling>(
				"GET",
				`/v1/admin/accounts/${segment(accountId)}/billing`,
			),
		listProviders: () =>
			request<{ items: Provider[] }>("GET", "/v1/admin/providers"),
		getProvidersText: () =>
			request<ProvidersText>("GET", "/v1/admin/providers-toml"),
	};

	function writes(adminId: string) {
		const write = <T>(method: string, path: string, body?: unknown) =>
			request<T>(method, path, { body, adminId });
		const visitorAction = (id: string, action: string, body?: unknown) =>
			write<{ visitor: Visitor }>(
				"POST",
				`/v1/admin/visitors/${segment(id)}/${action}`,
				body,
			);

		return {
			...reads,
			whitelistVisitor: (id: string) => visitorAction(id, "whitelist"),
			unwhitelistVisitor: (id: string) => visitorAction(id, "unwhitelist"),
			blockVisitor: (id: string, reason?: string) =>
				visitorAction(id, "block", reason ? { reason } : {}),
			unblockVisitor: (id: string) => visitorAction(id, "unblock"),
			/** `ownerId` set = only visitors of that account's channels change. */
			bulkVisitors: (
				ids: string[],
				action: BulkAction,
				reason?: string,
				ownerId?: string,
			) =>
				write<{ updated: number }>("POST", "/v1/admin/visitors/bulk", {
					ids,
					action,
					...(reason ? { reason } : {}),
					...(ownerId ? { ownerId } : {}),
				}),
			deleteVisitorMessages: (id: string) =>
				write<void>("DELETE", `/v1/admin/visitors/${segment(id)}/messages`),
			createChannel: (input: NewChannel) =>
				write<{ channel: Channel; secretKey: string }>(
					"POST",
					"/v1/admin/channels",
					input,
				),
			updateChannel: (id: string, input: UpdateChannelInput) =>
				write<{ channel: Channel }>(
					"PATCH",
					`/v1/admin/channels/${segment(id)}`,
					input,
				),
			savePersona: (channelId: string, persona: Persona) =>
				write<PersonaView>(
					"PUT",
					`/v1/admin/channels/${segment(channelId)}/persona`,
					persona,
				),
			previewPersona: (channelId: string, persona: Persona) =>
				write<PersonaView>(
					"POST",
					`/v1/admin/channels/${segment(channelId)}/persona/preview`,
					persona,
				),
			pickAgentModel: (id: string, pick: AgentPick) =>
				write<AgentSettingsView>(
					"PUT",
					`/v1/admin/agents/${segment(id)}/model`,
					pick,
				),
			testAgent: (id: string) =>
				write<AgentTestResult>(
					"POST",
					`/v1/admin/agents/${segment(id)}/test`,
					{},
				),
			saveProvider: (id: string, input: ProviderInput) =>
				write<{ items: Provider[] }>(
					"PUT",
					`/v1/admin/providers/${segment(id)}`,
					input,
				),
			deleteProvider: (id: string) =>
				write<{ items: Provider[] }>(
					"DELETE",
					`/v1/admin/providers/${segment(id)}`,
				),
			saveModel: (providerId: string, model: ProviderModel) =>
				write<{ items: Provider[] }>(
					"PUT",
					`/v1/admin/providers/${segment(providerId)}/models`,
					model,
				),
			deleteModel: (providerId: string, modelId: string) =>
				write<{ items: Provider[] }>(
					"DELETE",
					`/v1/admin/providers/${segment(providerId)}/models${toSearch({ model: modelId })}`,
				),
			/** Writes nothing, but it is a POST: the orchestrator wants X-Admin-Id on every non-GET admin call. */
			checkProvidersText: (toml: string) =>
				write<ProvidersCheck>("POST", "/v1/admin/providers-toml/check", {
					toml,
				}),
			saveProvidersText: (toml: string) =>
				write<ProvidersText>("PUT", "/v1/admin/providers-toml", { toml }),
			/** Removes every channel of an account with its data; `llm_calls` stay with the channel cleared. */
			deleteOwnerChannels: (ownerId: string) =>
				write<{ deleted: number }>(
					"DELETE",
					`/v1/admin/owners/${segment(ownerId)}/channels`,
				),
			rotateChannelKeys: (id: string) =>
				write<{ channel: Channel; secretKey: string }>(
					"POST",
					`/v1/admin/channels/${segment(id)}/rotate-keys`,
				),
			createBlockedIp: (input: CreateBlockedIpInput) =>
				write<{ item: BlockedIp }>("POST", "/v1/admin/blocked-ips", input),
			judgeIntent: (id: string, verdict: IntentVerdictInput) =>
				write<{ item: IntentExample }>(
					"PATCH",
					`/v1/admin/intents/${segment(id)}`,
					verdict,
				),
			deleteBlockedIp: (id: string) =>
				write<void>("DELETE", `/v1/admin/blocked-ips/${segment(id)}`),
		};
	}

	return { ...reads, as: writes };
}

export type OrchestratorClient = ReturnType<typeof createOrchestratorClient>;
export type OrchestratorWriter = ReturnType<OrchestratorClient["as"]>;
