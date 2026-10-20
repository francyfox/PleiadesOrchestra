import { describe, expect, test } from "bun:test";
import { llmCalls } from "../database/database.schema.ts";
import {
	admin,
	DAY,
	json,
	NOW,
	seedLlmCall,
	setupAdminApp,
} from "../http/http.testing.ts";
import { upsertIdentifiedVisitor } from "../visitors/visitors.service.ts";
import { usageRows } from "./usage.service.ts";

describe("admin usage", () => {
	test("groupBy visitor labels deleted visitors; groupBy day buckets by UTC day", async () => {
		const { app, db } = setupAdminApp();
		const visitor = upsertIdentifiedVisitor(
			db,
			"ch_telegram",
			"1",
			"Ivan",
			NOW,
		);
		seedLlmCall(db, visitor.id, NOW - DAY, 10, 1);
		seedLlmCall(db, null, NOW, 5, null);

		const byVisitor = await json(
			await app.handle(admin("/usage?groupBy=visitor")),
		);
		expect(byVisitor.rows).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					key: visitor.id,
					label: "Ivan",
					inputTokens: 10,
				}),
				expect.objectContaining({
					key: null,
					label: "(удалён)",
					callsWithoutUsage: 1,
				}),
			]),
		);

		const byDay = await json(await app.handle(admin("/usage?groupBy=day")));
		expect(byDay.rows.map((r: { key: string }) => r.key)).toEqual([
			"2026-09-23",
			"2026-09-24",
		]);

		const byChannel = await json(
			await app.handle(admin("/usage?groupBy=channel&channel=telegram")),
		);
		expect(byChannel.rows).toEqual([
			expect.objectContaining({ key: "telegram", calls: 2 }),
		]);
	});

	test("spend is tokens × the model's price per day, channel and model; local models cost 0, no prices = null", async () => {
		const { app, db } = setupAdminApp();
		const call = (at: number, model: string, input: number, output: number) =>
			db
				.insert(llmCalls)
				.values({
					at,
					channelId: "ch_telegram",
					kind: "generate",
					provider: "x",
					model,
					inputTokens: input,
					outputTokens: output,
					latencyMs: 1,
					ok: true,
				})
				.run();
		call(NOW - DAY, "paid/model", 1_000_000, 500_000);
		call(NOW, "paid/model", 1_000_000, 0);
		call(NOW, "local-model", 9_000_000, 9_000_000);
		const prices = new Map([
			["paid/model", { input: 0.0000002, output: 0.000001 }],
		]);
		const range = [NOW - 2 * DAY, NOW] as const;

		const byDay = usageRows(db, "day", ...range, undefined, prices);
		expect(byDay.map((r) => [r.key, r.costUsd])).toEqual([
			["2026-09-23", expect.closeTo(0.2 + 0.5, 10)],
			["2026-09-24", expect.closeTo(0.2, 10)],
		]);
		const byChannel = usageRows(db, "channel", ...range, undefined, prices);
		expect(byChannel[0]?.costUsd).toBeCloseTo(0.9, 10);
		const byModel = usageRows(db, "model", ...range, undefined, prices);
		expect(byModel.find((r) => r.key === "paid/model")).toMatchObject({
			price: {
				inputPerMillion: expect.closeTo(0.2, 10),
				outputPerMillion: expect.closeTo(1, 10),
			},
		});
		expect(byModel.find((r) => r.key === "local-model")).toMatchObject({
			costUsd: 0,
			price: null,
		});

		const noPrices = await json(
			await app.handle(admin("/usage?groupBy=model")),
		);
		expect(
			noPrices.rows.every((r: { costUsd: unknown }) => r.costUsd === null),
		).toBe(true);
	});
});
