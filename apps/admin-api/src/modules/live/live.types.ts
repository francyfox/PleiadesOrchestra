import type { AdminsPage } from "../admins/admins.schema.ts";
import type { Agent } from "../agents/agents.schema.ts";
import type { BlockedIp } from "../blocked-ips/blocked-ips.schema.ts";
import type { Channel } from "../channels/channels.schema.ts";
import type { McpSites } from "../mcp/mcp.schema.ts";
import type { PerformanceReport } from "../performance/performance.schema.ts";
import type { RequestsPage, RequestView } from "../requests/requests.schema.ts";
import type { Stats } from "../stats/stats.schema.ts";
import type { UsageRow } from "../usage/usage.schema.ts";
import type {
	UserDetails,
	UsersPage,
	UsersQuery,
} from "../users/users.schema.ts";

/** `page`/`pageSize` as the paged REST lists take them (no `pageSize` = everything). */
export interface PageParams {
	page?: number;
	pageSize?: number;
}

/** `GET /api/dashboard`. */
export interface DashboardData {
	stats: Stats;
	byDay: { day: string; inputTokens: number; outputTokens: number }[];
	topUsers: UsageRow[];
	byChannel: UsageRow[];
}

/**
 * What an admin page can subscribe to over `/api/live`: each topic's `data`
 * is exactly the body of the REST endpoint the page's `load` already calls,
 * so a pushed snapshot can replace the loaded data one to one.
 */
export interface LiveTopics {
	dashboard: { params: Record<string, never>; data: DashboardData };
	users: { params: UsersQuery; data: UsersPage };
	user: { params: { id: string }; data: UserDetails };
	channels: { params: PageParams; data: { items: Channel[]; total: number } };
	"blocked-ips": {
		params: PageParams;
		data: { items: BlockedIp[]; total: number };
	};
	admins: { params: PageParams; data: AdminsPage };
	agents: { params: Record<string, never>; data: { items: Agent[] } };
	performance: { params: { from?: number }; data: PerformanceReport };
	requests: { params: PageParams; data: RequestsPage };
	request: { params: { id: string }; data: RequestView };
	mcp: { params: Record<string, never>; data: McpSites };
}

export type LiveTopic = keyof LiveTopics;

/** Messages a browser sends on `/api/live`. `id` is chosen by the browser and names one subscription. */
export type LiveClientMessage =
	| {
			type: "subscribe";
			id: string;
			topic: LiveTopic;
			params: LiveTopics[LiveTopic]["params"];
	  }
	| { type: "unsubscribe"; id: string };

/** Why a subscription can't deliver data; the browser keeps its last data and may retry. */
export type LiveErrorCode = "unknown_topic" | "invalid_params" | "upstream";

/** Messages the server sends. `data` arrives once on subscribe, then only when it changed. */
export type LiveServerMessage =
	| { type: "data"; id: string; data: unknown }
	| { type: "error"; id: string; code: LiveErrorCode };
