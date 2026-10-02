/**
 * Types of the admin-api contract — the only module `apps/admin` imports
 * from this package (type-only). Everything is derived from the TypeBox
 * schemas the routes validate with, so panel and API can't drift apart.
 */

export type {
	AdminAccount,
	AdminSelf,
	AdminsPage,
} from "./modules/admins/admins.schema.ts";
export type {
	Agent,
	AgentRole,
	AgentStatus,
} from "./modules/agents/agents.schema.ts";
export type {
	BlockedIp,
	CreateBlockedIpInput,
} from "./modules/blocked-ips/blocked-ips.schema.ts";
export type {
	AccessMode,
	Channel,
	ChannelKind,
	ChannelRef,
	CreateChannelInput,
	UpdateChannelInput,
} from "./modules/channels/channels.schema.ts";
export type {
	ApiError,
	CallKind,
	PageQuery,
	WorldState,
} from "./modules/common/common.schema.ts";
export type {
	DashboardData,
	LiveClientMessage,
	LiveErrorCode,
	LiveServerMessage,
	LiveTopic,
	LiveTopics,
	PageParams,
} from "./modules/live/live.types.ts";
export type {
	McpParam,
	McpSite,
	McpSites,
	McpTool,
} from "./modules/mcp/mcp.schema.ts";
export type {
	LatencyStats,
	PerformanceReport,
} from "./modules/performance/performance.schema.ts";
export type {
	TraceEvent,
	TraceEventType,
} from "./modules/plan-runs/plan-runs.schema.ts";
export type {
	NodeCall,
	NodeDetail,
	NodeStatus,
	RequestEdge,
	RequestNode,
	RequestStatus,
	RequestSummary,
	RequestsPage,
	RequestView,
} from "./modules/requests/requests.schema.ts";
export type { Session } from "./modules/session/session.schema.ts";
export type { Stats } from "./modules/stats/stats.schema.ts";
export type {
	CpuInfo,
	GpuInfo,
	MemoryInfo,
	SystemSnapshot,
} from "./modules/system/system.schema.ts";
export type {
	UsageByDay,
	UsageByModel,
	UsageGroupBy,
	UsageRow,
	UsageTotals,
} from "./modules/usage/usage.schema.ts";
export type {
	AdminMessage,
	AdminUser,
	BulkAction,
	SortOrder,
	UserDetails,
	UserKind,
	UserStatus,
	UsersPage,
	UsersQuery,
	UsersSort,
} from "./modules/users/users.schema.ts";
