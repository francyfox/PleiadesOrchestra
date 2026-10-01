import { describe, expect, test } from "bun:test";
import { testApp } from "../../app.testing.ts";
import { createAdminDirectory } from "../admins/admins.service.ts";
import type { OrchestratorClient } from "../orchestrator/orchestrator.ts";
import { createLiveTopics, LIVE_INTERVALS_MS } from "./live-topics.ts";

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_000 * DAY;

/** A stub orchestrator that records what it was asked and answers with canned data. */
function fakeOrchestrator() {
	const calls: [string, unknown][] = [];
	const row = (label: string, input: number, output: number) => ({
		key: label,
		label,
		inputTokens: input,
		outputTokens: output,
		calls: 1,
		callsWithoutUsage: 0,
		avgLatencyMs: 5,
	});
	const record = (name: string, value: unknown) => (arg?: unknown) => {
		calls.push([name, arg]);
		return Promise.resolve(value);
	};
	const orchestrator = {
		stats: record("stats", { users: { total: 1 }, usage: {} }),
		usage: (query: { groupBy: string }) => {
			calls.push(["usage", query]);
			return Promise.resolve({
				rows:
					query.groupBy === "day"
						? [row("2026-09-27", 1, 1)]
						: [row("small", 1, 1), row("big", 50, 50), row("mid", 5, 5)],
			});
		},
		listUsers: record("listUsers", { items: [], nextCursor: null, total: 0 }),
		getUser: record("getUser", { user: { id: "u1" } }),
		listChannels: record("listChannels", { items: [], total: 0 }),
		listBlockedIps: record("listBlockedIps", { items: [], total: 0 }),
		listAgents: record("listAgents", { items: [] }),
		performance: record("performance", { rows: [], overall: [] }),
	} as unknown as OrchestratorClient;
	return { orchestrator, calls };
}

function topics() {
	const t = testApp();
	const { orchestrator, calls } = fakeOrchestrator();
	const built = createLiveTopics({
		orchestrator,
		db: t.db,
		now: () => NOW,
		admins: createAdminDirectory(t.db),
	});
	return { ...t, topics: built, calls, orchestrator };
}

describe("createLiveTopics: validation", () => {
	const { topics: t } = topics();

	test("every topic of the protocol exists, with the intervals of the spec", () => {
		expect(Object.keys(t).sort()).toEqual(
			[
				"admins",
				"agents",
				"blocked-ips",
				"channels",
				"dashboard",
				"performance",
				"user",
				"users",
			].sort(),
		);
		expect(LIVE_INTERVALS_MS).toEqual({
			dashboard: 5000,
			users: 5000,
			user: 3000,
			channels: 10000,
			"blocked-ips": 10000,
			admins: 10000,
			agents: 10000,
			performance: 15000,
		});
		for (const [name, topic] of Object.entries(t)) {
			expect(topic.intervalMs).toBe(
				LIVE_INTERVALS_MS[name as keyof typeof LIVE_INTERVALS_MS],
			);
		}
	});

	test("topics without params take exactly {}", () => {
		for (const name of ["dashboard", "agents"] as const) {
			expect(t[name].validate({})).toBe(true);
			expect(t[name].validate({ x: 1 })).toBe(false);
			expect(t[name].validate(null)).toBe(false);
			expect(t[name].validate("x")).toBe(false);
		}
	});

	test("users take the REST query and nothing else", () => {
		expect(
			t.users.validate({
				status: "blocked",
				sort: "tokens",
				order: "asc",
				limit: 10,
			}),
		).toBe(true);
		expect(t.users.validate({})).toBe(true);
		expect(t.users.validate({ status: "zzz" })).toBe(false);
		expect(t.users.validate({ limit: 0 })).toBe(false);
		expect(t.users.validate({ limit: 500 })).toBe(false);
		expect(t.users.validate({ nope: 1 })).toBe(false);
		expect(t.users.validate([])).toBe(false);
	});

	test("user needs a non-empty id", () => {
		expect(t.user.validate({ id: "u1" })).toBe(true);
		expect(t.user.validate({ id: "" })).toBe(false);
		expect(t.user.validate({})).toBe(false);
		expect(t.user.validate({ id: 1 })).toBe(false);
	});

	test("paged lists take the REST paging", () => {
		for (const name of ["channels", "blocked-ips", "admins"] as const) {
			expect(t[name].validate({})).toBe(true);
			expect(t[name].validate({ page: 2, pageSize: 10 })).toBe(true);
			expect(t[name].validate({ page: 0 })).toBe(false);
			expect(t[name].validate({ pageSize: 101 })).toBe(false);
			expect(t[name].validate({ extra: true })).toBe(false);
		}
	});

	test("performance takes an optional numeric `from`", () => {
		expect(t.performance.validate({})).toBe(true);
		expect(t.performance.validate({ from: 123 })).toBe(true);
		expect(t.performance.validate({ from: "yesterday" })).toBe(false);
	});
});

describe("createLiveTopics: fetching", () => {
	test("each topic asks the orchestrator exactly what its REST endpoint does", async () => {
		const { topics: t, calls } = topics();
		await t.users.fetch({ status: "blocked" });
		await t.user.fetch({ id: "u1" });
		await t.channels.fetch({ page: 2, pageSize: 10 });
		await t["blocked-ips"].fetch({ page: 1 });
		await t.agents.fetch({});
		expect(calls).toEqual([
			["listUsers", { status: "blocked" }],
			["getUser", "u1"],
			["listChannels", { page: 2, pageSize: 10 }],
			["listBlockedIps", { page: 1 }],
			["listAgents", undefined],
		]);
	});

	test("performance defaults to the last 30 days, like the REST endpoint", async () => {
		const { topics: t, calls } = topics();
		await t.performance.fetch({});
		await t.performance.fetch({ from: 42 });
		expect(calls).toEqual([
			["performance", { from: NOW - 30 * DAY }],
			["performance", { from: 42 }],
		]);
	});

	test("the dashboard is the REST dashboard: stats, days, top 10 users and channels by tokens", async () => {
		const { topics: t } = topics();
		const data = (await t.dashboard.fetch({})) as {
			byDay: unknown[];
			byChannel: { label: string }[];
		};
		expect(data.byDay).toEqual([
			{ day: "2026-09-27", inputTokens: 1, outputTokens: 1 },
		]);
		expect(data.byChannel.map((row) => row.label)).toEqual([
			"big",
			"mid",
			"small",
		]);
	});

	test("the REST endpoints and the topics can't drift: same body from both", async () => {
		const { call, registerFirst, topics: t } = topics();
		const cookie = await registerFirst();
		// A second app instance would need its own orchestrator, so compare the shared pieces directly.
		const admins = await (await call("/api/admins", { cookie })).json();
		expect(await t.admins.fetch({})).toEqual(admins);
		const paged = await (
			await call("/api/admins?pageSize=1&page=1", { cookie })
		).json();
		expect(await t.admins.fetch({ pageSize: 1, page: 1 })).toEqual(paged);
	});
});
