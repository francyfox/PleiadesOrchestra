import { describe, expect, test } from "bun:test";
import type { GoapAction, LlmCallRecord } from "@repo/core";
import {
	createWebMcpActions,
	InMemoryWorldStateStore,
	plan,
	pruneUnproducibleFacts,
	reportTokens,
	UntranslatableError,
} from "@repo/core";
import { createWebChannel } from "../channels/channels.service.ts";
import { testDb } from "../database/database.testing.ts";
import { withEnglishOnly } from "../english-only/english-only.ts";
import { REPLY_ACTION } from "../goap/goap.service.ts";
import { listIntentExamples } from "../intents/intents.service.ts";
import type { VisitorRow } from "../visitors/visitors.types.ts";
import {
	prepareNewMessage,
	prepareResume,
	replyAfterTask,
	toolResultText,
} from "./reply.service.ts";
import { ReplyService } from "./reply.ts";
import type { ReplyDeps } from "./reply.types.ts";

const action = (name: string): GoapAction => ({
	name,
	cost: 1,
	preconditions: {},
	effects: {},
	execute: async () => ({}),
});

describe("toolResultText", () => {
	test("joins the text parts of an MCP-shaped answer", () => {
		expect(
			toolResultText({
				content: [
					{ type: "text", text: "line 1" },
					{ type: "image" },
					{ type: "text", text: "line 2" },
				],
			}),
		).toBe("line 1\nline 2");
	});

	test("takes a plain string as it is and JSON-encodes anything else", () => {
		expect(toolResultText("hello")).toBe("hello");
		expect(toolResultText({ ok: true })).toBe('{"ok":true}');
		expect(toolResultText(undefined)).toBe("");
	});

	test("a huge object answer is cut while serializing, not after", () => {
		const huge = {
			rows: Array.from({ length: 200_000 }, (_, i) => `row ${i}`),
		};
		const text = toolResultText(huge);
		expect(text.length).toBeLessThanOrEqual(4000);
		expect(text.startsWith('{"rows":["row 0"')).toBe(true);
	});

	test("an oversized text part is cut before parts are joined", () => {
		const text = toolResultText({
			content: [{ text: "a".repeat(10_000_000) }, { text: "b" }],
		});
		expect(text.length).toBeLessThanOrEqual(4000);
	});

	test("is capped, so a huge page can't fill the world state", () => {
		expect(toolResultText("x".repeat(100_000)).length).toBeLessThanOrEqual(
			4000,
		);
	});
});

describe("replyAfterTask", () => {
	test("the reply waits for the task's own goal facts, nothing else changes", () => {
		const [reply, other] = replyAfterTask(
			[action(REPLY_ACTION), action("search")],
			{ replied: true, inCart: true },
		);
		expect(reply?.preconditions).toEqual({ inCart: true });
		expect(other?.preconditions).toEqual({});
	});

	test("a plain chat goal leaves the actions as they are", () => {
		const actions = [action(REPLY_ACTION)];
		expect(replyAfterTask(actions, { replied: true })).toBe(actions);
	});
});

describe("prepareResume", () => {
	async function deps(state: Record<string, string | boolean>) {
		const worldStateStore = new InMemoryWorldStateStore();
		await worldStateStore.save("t1", { state, goal: { inCart: true } });
		return {
			db: testDb(),
			worldStateStore,
			webmcpCatalog: new Map(),
			actions: [],
		} as unknown as ReplyDeps;
	}

	test("puts the tool's outcome and its answer text into the state, keeps the goal", async () => {
		const prepared = await prepareResume(
			await deps({
				query: "cheese",
				planRunId: "run-1",
				awaitedTool: "search_products",
			}),
			"t1",
			"run-2",
			{
				callId: "run-1",
				tool: "search_products",
				isError: false,
				result: { content: [{ type: "text", text: "- Swiss Cheese — $4" }] },
			},
		);
		expect(prepared.goal).toEqual({ inCart: true });
		expect(prepared.state).toMatchObject({
			query: "cheese",
			planRunId: "run-2",
			"webmcp:search_products:result": "ok",
			"webmcp:search_products:text": "- Swiss Cheese — $4",
		});
	});

	test("an error result is recorded as such", async () => {
		const prepared = await prepareResume(
			await deps({ planRunId: "run-1", awaitedTool: "add_to_cart" }),
			"t1",
			"r",
			{ callId: "run-1", tool: "add_to_cart", isError: true },
		);
		expect(prepared.state["webmcp:add_to_cart:result"]).toBe("error");
		// consumed: the same answer cannot be replayed against this state
		expect(prepared.state.awaitedTool).toBeUndefined();
	});

	test("a callId other than the run that waited is refused", async () => {
		expect(
			prepareResume(
				await deps({ planRunId: "run-1", awaitedTool: "add_to_cart" }),
				"t1",
				"r",
				{ callId: "other", tool: "add_to_cart", isError: false },
			),
		).rejects.toThrow("unexpected tool result");
	});

	test("a tool other than the awaited one is refused", async () => {
		expect(
			prepareResume(
				await deps({ planRunId: "run-1", awaitedTool: "add_to_cart" }),
				"t1",
				"r",
				{ callId: "run-1", tool: "checkout", isError: false },
			),
		).rejects.toThrow("unexpected tool result");
	});

	test("a checkpoint that waits on nothing refuses any result", async () => {
		expect(
			prepareResume(await deps({ planRunId: "run-1" }), "t1", "r", {
				callId: "run-1",
				tool: "add_to_cart",
				isError: false,
			}),
		).rejects.toThrow("unexpected tool result");
	});

	test("nothing to resume is an error", async () => {
		const empty = {
			worldStateStore: new InMemoryWorldStateStore(),
			webmcpCatalog: new Map(),
			actions: [],
		} as unknown as ReplyDeps;
		expect(
			prepareResume(empty, "t1", "r", {
				callId: "c",
				tool: "x",
				isError: false,
			}),
		).rejects.toThrow("nothing to resume");
	});
});

describe("prepareNewMessage: «now buy them» after a search", () => {
	async function prepare(
		session: Record<string, string | boolean>,
		text: string,
		english: string,
	) {
		const worldStateStore = new InMemoryWorldStateStore();
		await worldStateStore.save("t1", { state: session, goal: {} });
		const deps = {
			worldStateStore,
			webmcpCatalog: new Map([["t1", [action("add_to_cart")]]]),
			actions: [],
			translate: () => english,
			intentMemory: {
				classify: () => ({ intent: "addToCart", via: "exact", confidence: 1 }),
			},
			now: () => 0,
		} as unknown as ReplyDeps;
		const visitor = { id: "u", channelId: "c" } as VisitorRow;
		return prepareNewMessage(deps, visitor, "t1", "run-1", text, {});
	}

	test("a message that names no product reuses the last found one and skips the search", async () => {
		const prepared = await prepare(
			{
				storeOpen: true,
				store: "Penny Pantry",
				lastProduct: "Butter Croissants",
			},
			"а теперь купи их",
			"Now buy them.",
		);
		expect(prepared.state).toMatchObject({
			messageIntent: "addToCart",
			product: "Butter Croissants",
			catalogSearched: true,
			requestParsed: true,
			quantity: 1,
		});
	});

	test("a message that names a product searches for it as before", async () => {
		const prepared = await prepare(
			{ storeOpen: true, lastProduct: "Whole Milk" },
			"купи сыр",
			"Buy cheese.",
		);
		expect(prepared.state.catalogSearched).toBeUndefined();
		expect(prepared.state.product).toBeUndefined();
	});

	test("without a remembered product nothing is assumed", async () => {
		const prepared = await prepare({ storeOpen: true }, "купи их", "Buy them.");
		expect(prepared.state.catalogSearched).toBeUndefined();
	});
});

describe("prepareNewMessage / prepareResume: a message that names a tool's option", () => {
	const decisionAgent = {
		async decide(state: unknown) {
			const name = (state as { name?: string }).name;
			const choice =
				name === "add_to_cart" || name === "book_tickets"
					? "addToCart"
					: "search";
			return {
				intent: { type: "choice", choice, probabilities: { [choice]: 1 } },
			};
		},
	};
	const tools = [
		{
			name: "search_products",
			inputSchema: {
				type: "object" as const,
				properties: { query: { type: "string" } },
			},
		},
		{
			name: "add_to_cart",
			inputSchema: {
				type: "object" as const,
				properties: { items: { type: "array" } },
			},
		},
		{
			name: "book_tickets",
			inputSchema: {
				type: "object" as const,
				properties: { format: { type: "string", enum: ["2D", "IMAX Laser"] } },
			},
		},
	];

	async function deps() {
		const catalog = pruneUnproducibleFacts(
			await createWebMcpActions({
				tools,
				decisionAgent: decisionAgent as never,
			}),
		);
		return {
			db: testDb(),
			worldStateStore: new InMemoryWorldStateStore(),
			webmcpCatalog: new Map([["t1", catalog]]),
			actions: [],
			translate: () => undefined,
			intentMemory: {
				classify: () => ({ intent: "addToCart", via: "exact", confidence: 1 }),
			},
			now: () => 0,
		} as unknown as ReplyDeps;
	}
	const visitor = { id: "u", channelId: "c" } as VisitorRow;
	// The task part of the goal; the reply step is not in these test catalogs.
	const TASK = { inCart: true };

	test("plans the named tool alone, with the value as a fact", async () => {
		const prepared = await prepareNewMessage(
			await deps(),
			visitor,
			"t1",
			"r",
			"book two seats in IMAX Laser",
			{},
		);
		expect(prepared.state).toMatchObject({
			specialistTool: "book_tickets",
			format: "IMAX Laser",
		});
		const steps = plan(prepared.state, TASK, prepared.actions);
		expect(steps?.map((s) => s.name)).toEqual(["book_tickets"]);
	});

	test("a message that names no option plans the plain tool as before", async () => {
		const prepared = await prepareNewMessage(
			await deps(),
			visitor,
			"t1",
			"r",
			"book two seats in 2D",
			{},
		);
		expect(prepared.state.specialistTool).toBeUndefined();
		const steps = plan(prepared.state, TASK, prepared.actions);
		expect(steps?.map((s) => s.name)).not.toContain("book_tickets");
	});

	test("after the pause for the browser the same tool is still the one planned", async () => {
		const d = await deps();
		const first = await prepareNewMessage(
			d,
			visitor,
			"t1",
			"r",
			"book two seats in IMAX Laser",
			{},
		);
		await d.worldStateStore.save("t1", {
			state: { ...first.state, planRunId: "r", awaitedTool: "book_tickets" },
			goal: first.goal,
		});
		const resumed = await prepareResume(d, "t1", "r2", {
			callId: "r",
			tool: "book_tickets",
			isError: false,
		});
		const steps = plan(resumed.state, TASK, resumed.actions);
		expect(steps?.map((s) => s.name)).toEqual(["book_tickets"]);
	});
});

describe("prepareNewMessage: «remove everything» reads the list first", () => {
	const decisionAgent = {
		async decide() {
			return {};
		},
	};
	const tools = [
		{
			name: "get_cart",
			inputSchema: { type: "object" as const, properties: {} },
		},
		{
			name: "update_cart_item",
			inputSchema: {
				type: "object" as const,
				properties: {
					product: { type: "string" },
					quantity: {
						type: "integer",
						minimum: 0,
						description: "The new quantity. 0 removes it.",
					},
				},
				required: ["product", "quantity"],
			},
		},
	];
	const visitor = { id: "u", channelId: "c" } as VisitorRow;

	async function prepare(text: string, english: string, only = tools) {
		const catalog = pruneUnproducibleFacts(
			await createWebMcpActions({
				tools: only,
				decisionAgent: decisionAgent as never,
			}),
		);
		const deps = {
			db: testDb(),
			worldStateStore: new InMemoryWorldStateStore(),
			webmcpCatalog: new Map([["t1", catalog]]),
			actions: [],
			translate: () => english,
			intentMemory: { classify: () => undefined },
			now: () => 0,
		} as unknown as ReplyDeps;
		return prepareNewMessage(deps, visitor, "t1", "r", text, {});
	}

	test("a removal that says «all» plans the reading tool, then the removing one", async () => {
		const prepared = await prepare(
			"удали все из корзины",
			"Remove everything from the basket.",
		);
		expect(prepared.state).toMatchObject({
			messageIntent: "removeFromCart",
			scopeAll: true,
		});
		expect(prepared.goal).toMatchObject({ inCart: false });
		const steps = plan(prepared.state, { inCart: false }, prepared.actions);
		expect(steps?.map((s) => s.name)).toEqual(["get_cart", "update_cart_item"]);
	});

	test("a removal of one product does not read the list", async () => {
		const prepared = await prepare(
			"удали сыр из корзины",
			"Remove the cheese from the cart.",
		);
		expect(prepared.state.scopeAll).toBeUndefined();
		const steps = plan(
			{ ...prepared.state, product: "Cheese" },
			{ inCart: false },
			prepared.actions,
		);
		expect(steps?.map((s) => s.name)).toEqual(["update_cart_item"]);
	});

	test("a site with no tool that removes does not get an unreachable goal (it was no_plan)", async () => {
		const prepared = await prepare(
			"удали сыр из корзины",
			"Remove the cheese.",
			[
				{
					name: "add_to_cart",
					inputSchema: { type: "object" as const, properties: {} },
				},
			],
		);
		expect(prepared.goal).toEqual({ replied: true });
	});
});

describe("registerWebMcpTools: Russian site, translator not ready", () => {
	const russianTool = {
		name: "найти_товар",
		description: "Поиск товаров в каталоге",
		inputSchema: { type: "object" as const, properties: {} },
	};

	test("the catalog is left unregistered (not cached as 'other'), the error is reported, and a later try classifies it", async () => {
		let ready = false;
		const decisionAgent = withEnglishOnly(
			{
				decide: async () => ({ intent: { type: "choice", choice: "search" } }),
			},
			{
				translate: async () => (ready ? "Search products in the catalog" : ""),
			},
		);
		const errors: unknown[] = [];
		const webmcpCatalog = new Map<string, GoapAction[]>();
		const service = new ReplyService({
			decisionAgent,
			webmcpCatalog,
			onError: (error: unknown) => errors.push(error),
		} as unknown as ReplyDeps);

		await service.registerWebMcpTools("t1", [russianTool]);
		expect(webmcpCatalog.has("t1")).toBe(false);
		expect(errors[0]).toBeInstanceOf(UntranslatableError);

		ready = true;
		await service.registerWebMcpTools("t1", [russianTool]);
		expect(webmcpCatalog.get("t1")?.length).toBeGreaterThan(0);
	});
});

describe("prepareNewMessage: what Laya is sure about is learned on its own", () => {
	function setup(
		answer: { choice: string; probability: number },
		autoApproveAt: number | null = 0.85,
	) {
		const db = testDb();
		// The run id is a stand-in: no plan_runs row exists in this unit test.
		db.$client.run("PRAGMA foreign_keys = OFF");
		const channel = createWebChannel(
			db,
			{ slug: "shop", name: "Shop", accessMode: "open", allowedOrigins: [] },
			1,
		).channel.id;
		const recorded: LlmCallRecord[] = [];
		const invalidated: string[] = [];
		const deps = {
			db,
			decisionAgent: {
				async decide() {
					reportTokens({ inputTokens: 30, outputTokens: 0 });
					return {
						intent: {
							type: "choice",
							choice: answer.choice,
							probabilities: { [answer.choice]: answer.probability },
						},
					};
				},
			},
			worldStateStore: new InMemoryWorldStateStore(),
			webmcpCatalog: new Map([["t1", [action("add_to_cart")]]]),
			actions: [],
			translate: (text: string) => text,
			intentMemory: {
				classify: () => undefined,
				invalidate: (id: string) => invalidated.push(id),
			},
			layaAutoApproveConfidence: autoApproveAt ?? undefined,
			usageRecorder: {
				flush() {},
				record: (c: LlmCallRecord) => recorded.push(c),
			},
			now: () => 0,
		} as unknown as ReplyDeps;
		const visitor = { id: "u", channelId: channel } as VisitorRow;
		const run = () =>
			prepareNewMessage(
				deps,
				visitor,
				"t1",
				"r",
				"put a jacket in the basket",
				{},
			);
		return { db, run, recorded, invalidated, channel };
	}

	test("at or above the threshold: approved as auto, memory rebuilt, confidence logged", async () => {
		const { db, run, recorded, invalidated, channel } = setup({
			choice: "addToCart",
			probability: 0.9,
		});
		await run();
		expect(listIntentExamples(db, {}).items[0]).toMatchObject({
			status: "approved",
			approvedBy: "auto",
			confidence: 0.9,
		});
		expect(invalidated).toEqual([channel]);
		expect(recorded.find((c) => c.kind === "classify")).toMatchObject({
			provider: "laya",
			confidence: 0.9,
			inputTokens: 30,
			outputTokens: 0,
		});
	});

	test("below the threshold: pending for a person, memory untouched, confidence still logged", async () => {
		const { db, run, recorded, invalidated } = setup({
			choice: "addToCart",
			probability: 0.6,
		});
		await run();
		expect(listIntentExamples(db, {}).items[0]).toMatchObject({
			status: "pending",
			approvedBy: null,
			confidence: 0.6,
		});
		expect(invalidated).toEqual([]);
		expect(recorded.find((c) => c.kind === "classify")?.confidence).toBe(0.6);
	});

	test("without the setting nothing is approved on its own", async () => {
		const { db, run } = setup({ choice: "addToCart", probability: 1 }, null);
		await run();
		expect(listIntentExamples(db, {}).items[0]?.status).toBe("pending");
	});
});

describe("a reply waits for its thread's catalog still being classified", () => {
	test("the catalog is pending while the model is slow, and settled after", async () => {
		let release = () => {};
		const decisionAgent = {
			decide: () =>
				new Promise((resolve) => {
					release = () =>
						resolve({ intent: { type: "choice", choice: "search" } });
				}),
		};
		const webmcpCatalog = new Map<string, GoapAction[]>();
		const service = new ReplyService({
			decisionAgent,
			webmcpCatalog,
		} as unknown as ReplyDeps);
		const pending = (
			service as unknown as { pending: Map<string, Promise<void>> }
		).pending;
		const registering = service.registerWebMcpTools("t1", [
			{
				name: "find",
				description: "Search",
				inputSchema: { type: "object" as const, properties: {} },
			},
		]);
		expect(pending.has("t1")).toBe(true);
		expect(webmcpCatalog.has("t1")).toBe(false);
		release();
		await registering;
		await Bun.sleep(0);
		expect(webmcpCatalog.has("t1")).toBe(true);
		expect(pending.has("t1")).toBe(false);
	});
});
