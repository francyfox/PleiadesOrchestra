import { describe, expect, test } from "bun:test";
import {
	call,
	json,
	setRespond,
	signedIn,
	USAGE,
	useHarness,
} from "../../app.harness.testing.ts";

useHarness();

describe("dashboard", () => {
	test("dashboard combines stats with usage by day, top users and channels", async () => {
		const cookie = await signedIn();
		const stats = {
			users: { total: 1, pending: 0, blocked: 0, anonymous: 0 },
			usage: { today: USAGE, last7d: USAGE, last30d: USAGE },
		};
		setRespond(({ url }) => {
			if (url.endsWith("/stats")) return json(stats);
			const rows = (label: string, tokens: number) => ({
				...USAGE,
				inputTokens: tokens,
				key: label,
				label,
				avgLatencyMs: 1,
			});
			return json({ rows: [rows("small", 1), rows("big", 100)] });
		});

		const body = await (await call("/api/dashboard", { cookie })).json();

		expect(body.stats.users.total).toBe(1);
		expect(body.byDay[0]).toEqual({
			day: "small",
			inputTokens: 1,
			outputTokens: 2,
		});
		expect(body.topUsers.map((r: { label: string }) => r.label)).toEqual([
			"big",
			"small",
		]);
		expect(body.byChannel.map((r: { label: string }) => r.label)).toEqual([
			"big",
			"small",
		]);
	});
});
