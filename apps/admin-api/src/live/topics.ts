import type { TObject } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { t } from "elysia";
import { PageQuery, UsersQuery } from "../schemas/orchestrator.ts";
import {
	type FetchContext,
	fetchAdminsPage,
	fetchDashboard,
	fetchPerformance,
} from "./fetchers.ts";
import type { HubTopic } from "./hub.ts";
import type { LiveTopic } from "./protocol.ts";

/** How often the hub re-reads each topic while a page watches it. */
export const LIVE_INTERVALS_MS: Record<LiveTopic, number> = {
	dashboard: 5000,
	users: 5000,
	user: 3000,
	channels: 10000,
	"blocked-ips": 10000,
	admins: 10000,
	agents: 10000,
	performance: 15000,
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

/** Accepts only what the schema describes — unknown keys are refused, so nobody can mint endless groups. */
const strictly = (schema: TObject) => (params: unknown) =>
	isRecord(params) &&
	Object.keys(params).every((key) => key in schema.properties) &&
	Value.Check(schema, params);

const NoParams = t.Object({});
const UserParams = t.Object({ id: t.String({ minLength: 1 }) });
const PerformanceParams = t.Object({ from: t.Optional(t.Number()) });

/**
 * The topics an admin page can subscribe to. Each `fetch` returns exactly the
 * body of the REST endpoint the page's `load` calls (through the shared
 * functions in fetchers.ts or the same orchestrator-client call), so a pushed
 * snapshot replaces the loaded data one to one.
 */
export function createLiveTopics(
	ctx: FetchContext,
	intervals: Partial<Record<LiveTopic, number>> = {},
): Record<LiveTopic, HubTopic> {
	const { orchestrator } = ctx;
	const every = (topic: LiveTopic) =>
		intervals[topic] ?? LIVE_INTERVALS_MS[topic];

	return {
		dashboard: {
			intervalMs: every("dashboard"),
			validate: strictly(NoParams),
			fetch: () => fetchDashboard(ctx),
		},
		users: {
			intervalMs: every("users"),
			validate: strictly(UsersQuery),
			fetch: (params) => orchestrator.listUsers(params as never),
		},
		user: {
			intervalMs: every("user"),
			validate: strictly(UserParams),
			fetch: (params) => orchestrator.getUser((params as { id: string }).id),
		},
		channels: {
			intervalMs: every("channels"),
			validate: strictly(PageQuery),
			fetch: (params) => orchestrator.listChannels(params as never),
		},
		"blocked-ips": {
			intervalMs: every("blocked-ips"),
			validate: strictly(PageQuery),
			fetch: (params) => orchestrator.listBlockedIps(params as never),
		},
		admins: {
			intervalMs: every("admins"),
			validate: strictly(PageQuery),
			fetch: (params) => fetchAdminsPage(ctx, params as never),
		},
		agents: {
			intervalMs: every("agents"),
			validate: strictly(NoParams),
			fetch: () => orchestrator.listAgents(),
		},
		performance: {
			intervalMs: every("performance"),
			validate: strictly(PerformanceParams),
			fetch: (params) => fetchPerformance(ctx, params as never),
		},
	};
}
