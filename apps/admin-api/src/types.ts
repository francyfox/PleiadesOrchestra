/**
 * Types of the admin-api contract — the only module `apps/admin` imports
 * from this package (type-only). Everything is derived from the TypeBox
 * schemas the routes validate with, so panel and API can't drift apart.
 */
export type {
	AdminAccount,
	AdminSelf,
	AdminsPage,
	Session,
} from "./schemas/accounts.ts";
export type { WorldState } from "./schemas/common.ts";
export type { ApiError } from "./schemas/errors.ts";
export type {
	AccessMode,
	AdminMessage,
	AdminUser,
	Agent,
	AgentRole,
	AgentStatus,
	BlockedIp,
	BulkAction,
	CallKind,
	Channel,
	ChannelKind,
	ChannelRef,
	CreateBlockedIpInput,
	CreateChannelInput,
	GoapActionInfo,
	LatencyStats,
	PageQuery,
	PerformanceReport,
	PlanRun,
	RunDetails,
	RunLlmCall,
	SortOrder,
	Stats,
	TraceEvent,
	TraceEventType,
	UpdateChannelInput,
	UsageByDay,
	UsageByModel,
	UsageGroupBy,
	UsageRow,
	UsageTotals,
	UserDetails,
	UserKind,
	UserStatus,
	UsersPage,
	UsersQuery,
	UsersSort,
} from "./schemas/orchestrator.ts";
export type {
	CpuInfo,
	GpuInfo,
	MemoryInfo,
	SystemSnapshot,
} from "./schemas/system.ts";
