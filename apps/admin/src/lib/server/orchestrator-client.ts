import type {
	AdminUser,
	BlockedIp,
	BulkAction,
	Channel,
	CreateBlockedIpInput,
	CreateChannelInput,
	GoapActionInfo,
	RunDetails,
	Stats,
	UpdateChannelInput,
	UsageGroupBy,
	UsageRow,
	UserDetails,
	UsersPage,
	UsersQuery,
} from "$lib/api-types";

export class OrchestratorError extends Error {
	override name = "OrchestratorError";
	constructor(
		readonly status: number,
		message: string,
	) {
		super(message);
	}
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
 * (docs/admin-api.md). Reads need only the admin key; mutations go through
 * `.as(adminId)` so every write carries `X-Admin-Id` for the audit fields.
 */
export function createOrchestratorClient(config: OrchestratorClientConfig) {
	const baseUrl = config.baseUrl.replace(/\/+$/, "");
	const fetchFn = config.fetch ?? fetch;

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
		listUsers: (query: UsersQuery) =>
			request<UsersPage>("GET", `/v1/admin/users${toSearch({ ...query })}`),
		getUser: (id: string) =>
			request<UserDetails>("GET", `/v1/admin/users/${segment(id)}`),
		usage: (query: {
			groupBy: UsageGroupBy;
			from?: number;
			to?: number;
			channel?: string;
		}) =>
			request<{ rows: UsageRow[] }>("GET", `/v1/admin/usage${toSearch(query)}`),
		stats: () => request<Stats>("GET", "/v1/admin/stats"),
		getRun: (id: string) =>
			request<RunDetails>("GET", `/v1/admin/runs/${segment(id)}`),
		goapActions: () =>
			request<{ actions: GoapActionInfo[] }>("GET", "/v1/admin/goap/actions"),
		listChannels: () =>
			request<{ items: Channel[] }>("GET", "/v1/admin/channels"),
		listBlockedIps: () =>
			request<{ items: BlockedIp[] }>("GET", "/v1/admin/blocked-ips"),
	};

	function writes(adminId: string) {
		const write = <T>(method: string, path: string, body?: unknown) =>
			request<T>(method, path, { body, adminId });
		const userAction = (id: string, action: string, body?: unknown) =>
			write<{ user: AdminUser }>(
				"POST",
				`/v1/admin/users/${segment(id)}/${action}`,
				body,
			);

		return {
			...reads,
			whitelistUser: (id: string) => userAction(id, "whitelist"),
			unwhitelistUser: (id: string) => userAction(id, "unwhitelist"),
			blockUser: (id: string, reason?: string) =>
				userAction(id, "block", reason ? { reason } : {}),
			unblockUser: (id: string) => userAction(id, "unblock"),
			bulkUsers: (ids: string[], action: BulkAction, reason?: string) =>
				write<{ updated: number }>(
					"POST",
					"/v1/admin/users/bulk",
					reason ? { ids, action, reason } : { ids, action },
				),
			deleteUserMessages: (id: string) =>
				write<void>("DELETE", `/v1/admin/users/${segment(id)}/messages`),
			createChannel: (input: CreateChannelInput) =>
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
			rotateChannelKeys: (id: string) =>
				write<{ channel: Channel; secretKey: string }>(
					"POST",
					`/v1/admin/channels/${segment(id)}/rotate-keys`,
				),
			createBlockedIp: (input: CreateBlockedIpInput) =>
				write<{ item: BlockedIp }>("POST", "/v1/admin/blocked-ips", input),
			deleteBlockedIp: (id: string) =>
				write<void>("DELETE", `/v1/admin/blocked-ips/${segment(id)}`),
		};
	}

	return { ...reads, as: writes };
}

export type OrchestratorClient = ReturnType<typeof createOrchestratorClient>;
export type OrchestratorWriter = ReturnType<OrchestratorClient["as"]>;
