/**
 * Types of the admin-api contract — the only module `apps/admin` imports
 * from this package (type-only). Everything is derived from the TypeBox
 * schemas the routes validate with, so panel and API can't drift apart.
 */

export type { Me } from "./modules/accounts/accounts.schema.ts";
export type {
	AdminAccount,
	AdminSelf,
	AdminsPage,
} from "./modules/admins/admins.schema.ts";
export type {
	Agent,
	AgentRole,
	AgentSettingsView,
	AgentStatus,
	AgentTestResult,
	Provider,
	ProviderModel,
} from "./modules/agents/agents.schema.ts";
export type {
	AccountBilling,
	StandingView,
} from "./modules/billing/billing.schema.ts";
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
	Persona,
	PersonaView,
	UpdateChannelInput,
} from "./modules/channels/channels.schema.ts";
export type {
	ApiError,
	CallKind,
	PageQuery,
	WorldState,
} from "./modules/common/common.schema.ts";
export type {
	Customer,
	CustomersPage,
} from "./modules/customers/customers.schema.ts";
export type {
	IntentExample,
	IntentsPage,
	IntentsQuery,
	IntentVerdictInput,
} from "./modules/intents/intents.schema.ts";
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
	CallChoice,
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
	PlanStatus,
	Subscription,
} from "./modules/subscriptions/subscriptions.schema.ts";
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
	BulkAction,
	SortOrder,
	Visitor,
	VisitorDetails,
	VisitorKind,
	VisitorStatus,
	VisitorsPage,
	VisitorsQuery,
	VisitorsSort,
} from "./modules/visitors/visitors.schema.ts";
