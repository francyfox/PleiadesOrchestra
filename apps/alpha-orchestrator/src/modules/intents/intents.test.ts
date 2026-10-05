import { describe, expect, test } from "bun:test";
import { createWebChannel } from "../channels/channels.service.ts";
import { testDb } from "../database/database.testing.ts";
import { admin, json, setupAdminApp } from "../http/http.testing.ts";
import {
	approvedExamples,
	IntentMemory,
	judgeIntentExample,
	learnIntent,
	listIntentExamples,
} from "./intents.service.ts";

function setup() {
	const db = testDb();
	const shop = createWebChannel(
		db,
		{ slug: "shop", name: "Shop", accessMode: "open", allowedOrigins: [] },
		1,
	);
	const parts = createWebChannel(
		db,
		{ slug: "parts", name: "Parts", accessMode: "open", allowedOrigins: [] },
		1,
	);
	return { db, shop: shop.channel.id, parts: parts.channel.id };
}

describe("learnIntent", () => {
	test("a label from Laya waits as pending and decides nothing", () => {
		const { db, shop } = setup();
		learnIntent(db, {
			channelId: shop,
			text: "Buy one cheese!",
			intent: "addToCart",
			planRunId: null,
			now: 10,
		});

		const { items, total } = listIntentExamples(db, {});
		expect(total).toBe(1);
		expect(items[0]).toMatchObject({
			sample: "Buy one cheese!",
			textKey: "buy one cheese",
			intent: "addToCart",
			source: "laya",
			status: "pending",
			seenCount: 1,
			channelName: "Shop",
		});
		expect(approvedExamples(db, shop)).toEqual([]);
	});

	test("the same text again only counts; it never changes what is already there", () => {
		const { db, shop } = setup();
		const first = { channelId: shop, planRunId: null, now: 10 };
		learnIntent(db, { ...first, text: "buy cheese", intent: "addToCart" });
		const [row] = listIntentExamples(db, {}).items;
		judgeIntentExample(db, row?.id ?? "", { status: "approved" }, 11);

		learnIntent(db, {
			...first,
			text: "Buy  cheese.",
			intent: "search",
			now: 20,
		});

		const { items } = listIntentExamples(db, {});
		expect(items).toHaveLength(1);
		expect(items[0]).toMatchObject({
			intent: "addToCart",
			status: "approved",
			seenCount: 2,
		});
	});

	test("an empty text teaches nothing", () => {
		const { db, shop } = setup();
		learnIntent(db, {
			channelId: shop,
			text: " !? ",
			intent: "chat",
			planRunId: null,
			now: 1,
		});
		expect(listIntentExamples(db, {}).total).toBe(0);
	});
});

describe("judgeIntentExample", () => {
	test("a correction sets the intent, marks it the admin's and approves it", () => {
		const { db, shop } = setup();
		learnIntent(db, {
			channelId: shop,
			text: "show my cart",
			intent: "addToCart",
			planRunId: null,
			now: 1,
		});
		const id = listIntentExamples(db, {}).items[0]?.id ?? "";

		const row = judgeIntentExample(db, id, { intent: "other" }, 5);

		expect(row).toMatchObject({
			intent: "other",
			source: "admin",
			status: "approved",
			updatedAt: 5,
		});
		expect(approvedExamples(db, shop)).toEqual([
			{ text: "show my cart", intent: "other" },
		]);
	});

	test("rejecting keeps the row but takes it out of the model", () => {
		const { db, shop } = setup();
		learnIntent(db, {
			channelId: shop,
			text: "hello",
			intent: "search",
			planRunId: null,
			now: 1,
		});
		const id = listIntentExamples(db, {}).items[0]?.id ?? "";
		judgeIntentExample(db, id, { status: "approved" }, 2);
		judgeIntentExample(db, id, { status: "rejected" }, 3);

		expect(approvedExamples(db, shop)).toEqual([]);
		expect(listIntentExamples(db, { status: "rejected" }).total).toBe(1);
	});

	test("an unknown id is undefined", () => {
		const { db } = setup();
		expect(judgeIntentExample(db, "nope", { status: "approved" }, 1)).toBe(
			undefined,
		);
	});
});

describe("listIntentExamples", () => {
	test("filters by status and channel, newest first, and pages", () => {
		const { db, shop, parts } = setup();
		for (const [i, channelId] of [shop, shop, parts].entries()) {
			learnIntent(db, {
				channelId,
				text: `phrase ${i}`,
				intent: "search",
				planRunId: null,
				now: 10 + i,
			});
		}
		const id = listIntentExamples(db, { channelId: parts }).items[0]?.id ?? "";
		judgeIntentExample(db, id, { status: "approved" }, 99);

		expect(
			listIntentExamples(db, { status: "pending" }).items.map((r) => r.sample),
		).toEqual(["phrase 1", "phrase 0"]);
		expect(listIntentExamples(db, { channelId: shop }).total).toBe(2);
		const page = listIntentExamples(db, { page: 2, pageSize: 2 });
		expect(page.total).toBe(3);
		expect(page.items).toHaveLength(1);
	});
});

describe("IntentMemory", () => {
	test("answers from the channel's approved examples only, and sees a change at once", () => {
		const { db, shop, parts } = setup();
		const memory = new IntentMemory(db);
		for (const text of ["buy one cheese", "add milk to my cart"]) {
			learnIntent(db, {
				channelId: shop,
				text,
				intent: "addToCart",
				planRunId: null,
				now: 1,
			});
		}
		expect(memory.classify(shop, "buy one cheese")).toBeUndefined();

		for (const row of listIntentExamples(db, {}).items) {
			judgeIntentExample(db, row.id, { status: "approved" }, 2);
		}
		memory.invalidate(shop);

		expect(memory.classify(shop, "buy one cheese")).toMatchObject({
			intent: "addToCart",
			via: "exact",
		});
		// Another site has not learned this.
		expect(memory.classify(parts, "buy one cheese")).toBeUndefined();
	});
});

describe("admin routes", () => {
	test("list, approve and correct over HTTP; a bad intent or status is refused; an unknown id is 404", async () => {
		const { db, app } = setupAdminApp();
		const channel = createWebChannel(
			db,
			{ slug: "shop", name: "Shop", accessMode: "open", allowedOrigins: [] },
			1,
		);
		learnIntent(db, {
			channelId: channel.channel.id,
			text: "show my cart",
			intent: "addToCart",
			planRunId: null,
			now: 1,
		});

		const list = await app.handle(admin("/intents?status=pending"));
		const { items, total } = await json<{
			items: { id: string }[];
			total: number;
		}>(list);
		expect(total).toBe(1);
		const id = items[0]?.id ?? "";

		const fixed = await app.handle(
			admin(`/intents/${id}`, {
				method: "PATCH",
				body: { intent: "other" },
			}),
		);
		expect(fixed.status).toBe(200);
		const { item } = await json<{ item: Record<string, unknown> }>(fixed);
		expect(item).toMatchObject({
			intent: "other",
			status: "approved",
			source: "admin",
			channelName: "Shop",
		});
		// The verdict answers with the same shape as a row of the list, which is
		// what admin-api validates both against.
		const relisted = await json<{ items: Record<string, unknown>[] }>(
			await app.handle(admin("/intents")),
		);
		expect(Object.keys(item).sort()).toEqual(
			Object.keys(relisted.items[0] ?? {}).sort(),
		);
		expect(item).toEqual(relisted.items[0] ?? {});

		for (const body of [{ intent: "nonsense" }, { status: "nope" }]) {
			const bad = await app.handle(
				admin(`/intents/${id}`, { method: "PATCH", body }),
			);
			expect(bad.status).toBe(422);
		}
		const missing = await app.handle(
			admin("/intents/nope", {
				method: "PATCH",
				body: { status: "approved" },
			}),
		);
		expect(missing.status).toBe(404);
	});
});
