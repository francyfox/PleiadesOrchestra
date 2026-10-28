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
import { type IntentPreset, mergePresets } from "@repo/intent-presets";
import { createWebChannel } from "../channels/channels.service.ts";
import { testDb } from "../database/database.testing.ts";
import { withEnglishOnly } from "../english-only/english-only.ts";
import { REPLY_ACTION } from "../goap/goap.service.ts";
import { listIntentExamples } from "../intents/intents.service.ts";
import type { VisitorRow } from "../visitors/visitors.types.ts";
import {
	pageFacts,
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

/** alpha-understand answering with this English text and no tasks. */
const sayEnglish = (en: string) => ({
	fillArguments: async () => ({ en, tasks: [] }),
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
			understandAgent: sayEnglish(english),
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
			requestParsed: true,
			quantity: 1,
		});
		expect(prepared.state.catalogSearched).toBeUndefined();
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
			understandAgent: sayEnglish(english),
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

describe("registerWebMcpTools: Russian site, alpha-understand not ready", () => {
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
				translate: async (texts) =>
					texts.map(() => (ready ? "Search products in the catalog" : "")),
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
			intentMemory: {
				classify: () => undefined,
				invalidate: (id: string) => invalidated.push(id),
			},
			decisionModel: () => ({
				provider: "openrouter",
				model: "liquid/d1-ultra",
			}),
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
			provider: "openrouter",
			model: "liquid/d1-ultra",
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

describe("prepareNewMessage: a channel without intent sets", () => {
	const tool = (name: string, description: string): GoapAction => ({
		...action(name),
		effects: { [`toolResult:${name}`]: true },
		description,
	});

	async function prepare(
		text: string,
		pick: string,
		options: {
			sets?: string[];
			probability?: number;
			extra?: GoapAction[];
			severalTasks?: boolean;
		} = {},
	) {
		const asked: string[][] = [];
		const split: string[] = [];
		const deps = {
			worldStateStore: new InMemoryWorldStateStore(),
			webmcpCatalog: new Map([
				[
					"t1",
					[
						tool("get_cart", "Read what is in the cart."),
						tool("set_pizza_size", "Change the size of a pizza."),
						...(options.extra ?? []),
					],
				],
			]),
			actions: [],
			intentSets: () => options.sets ?? [],
			severalTasks: () => options.severalTasks ?? false,
			functionCallAgent: {
				// No usable split: the message falls through to the tool choice.
				async fillArguments(call: { request: string }) {
					split.push(call.request);
					throw new Error("unusable");
				},
			},
			decisionAgent: {
				async decide(_state: unknown, questions: Record<string, unknown>) {
					const [key, question] = Object.entries(questions)[0] as [
						string,
						{ criteria: Record<string, string> },
					];
					asked.push(Object.keys(question.criteria));
					return {
						[key]: {
							type: "choice",
							choice: pick,
							probabilities: { [pick]: options.probability ?? 0.9 },
						},
					};
				},
			},
			now: () => 0,
		} as unknown as ReplyDeps;
		const visitor = { id: "u", channelId: "c" } as VisitorRow;
		const prepared = await prepareNewMessage(
			deps,
			visitor,
			"t1",
			"run-1",
			text,
			{},
		);
		return { prepared, asked, split };
	}

	test("several tasks are split only when the channel's switch forces it", async () => {
		const text = "make the pizza bigger and then show my cart";
		expect((await prepare(text, "get_cart")).split).toHaveLength(0);
		const forced = await prepare(text, "get_cart", { severalTasks: true });
		expect(forced.split).toEqual([text]);
		// Nothing usable came back: the message still gets its tool.
		expect(forced.prepared.goal).toMatchObject({ "toolResult:get_cart": true });
	});

	test("the tool Laya picks is the goal, whatever shop intent it would have had", async () => {
		const { prepared, asked } = await prepare(
			"make the pizza bigger",
			"set_pizza_size",
		);
		expect(prepared.goal).toMatchObject({ "toolResult:set_pizza_size": true });
		expect(asked[0]).toContain("set_pizza_size");
		expect(asked[0]).toContain("other");
	});

	test("an unclear message is not given a random tool: the reply asks, listing what the site can do", async () => {
		const { prepared } = await prepare("hmm, that thing", "other");
		expect(
			Object.keys(prepared.goal).some((k) => k.startsWith("toolResult:")),
		).toBe(false);
		expect(String(prepared.state.clarifyOptions)).toContain("set_pizza_size");
	});

	test("a message that says a tool's own option goes to that tool without asking Laya", async () => {
		const kit: GoapAction = {
			...tool("add_kit_to_cart", "Add every product of a kit to the cart."),
			bindToRequest: (state) =>
				String(state.userMessage).includes("Gym Starter")
					? { facts: { kit: "Gym Starter" }, score: 11 }
					: undefined,
		};
		const { prepared, asked } = await prepare(
			"add the Gym Starter kit to my cart",
			"get_cart",
			{ extra: [kit] },
		);
		expect(prepared.goal).toMatchObject({ "toolResult:add_kit_to_cart": true });
		expect(prepared.state).toMatchObject({ kit: "Gym Starter" });
		expect(asked).toHaveLength(0);
	});

	test("checkout words are still taken from the words, never from the tool choice", async () => {
		const { asked } = await prepare("checkout now please", "get_cart");
		expect(asked).toHaveLength(0);
	});

	test("a channel with the shop set keeps the intent flow", async () => {
		const { asked } = await prepare("show my cart", "get_cart", {
			sets: ["shop"],
		});
		expect(asked.every((round) => !round.includes("set_pizza_size"))).toBe(
			true,
		);
	});
});

describe("a channel's presets decide how its tools and messages are read", () => {
	// A preset with nothing of a shop in it.
	const bookings: IntentPreset = {
		id: "bookings",
		intents: {
			reserve: {
				description: "book a table",
				preconditions: { venueChosen: true },
				effects: { booked: true },
			},
			other: { description: "anything else", preconditions: {}, effects: {} },
		},
		toolCues: (tool) =>
			tool.name.startsWith("reserve") ? "reserve" : undefined,
	};
	const tool = {
		name: "reserve_table",
		description: "Book a table",
		inputSchema: { type: "object" as const, properties: {} },
	};

	test("the same tools classify apart per channel, and a channel's catalog is not served to another", async () => {
		const webmcpCatalog = new Map<string, GoapAction[]>();
		const service = new ReplyService({
			decisionAgent: { decide: async () => ({}) },
			webmcpCatalog,
			taxonomy: (channelId: string) =>
				channelId === "venue" ? mergePresets([bookings]) : undefined,
		} as unknown as ReplyDeps);

		await service.registerWebMcpTools("t-venue", [tool], "venue");
		await service.registerWebMcpTools("t-other", [tool], "other");
		const venue = webmcpCatalog
			.get("t-venue")
			?.find((a) => a.name === "reserve_table");
		const other = webmcpCatalog
			.get("t-other")
			?.find((a) => a.name === "reserve_table");
		expect(venue?.effects).toMatchObject({ booked: true });
		// A precondition nothing in the catalog can give is dropped (`pruneUnproducibleFacts`).
		expect(venue?.preconditions).toEqual({});
		expect(other?.effects).not.toHaveProperty("booked");
	});

	test("Laya is asked the intents of the channel's presets for a message", async () => {
		const asked: string[][] = [];
		const deps = {
			worldStateStore: new InMemoryWorldStateStore(),
			webmcpCatalog: new Map([["t1", [action("reserve_table")]]]),
			actions: [],
			taxonomy: () => mergePresets([bookings]),
			decisionAgent: {
				async decide(_state: unknown, questions: Record<string, unknown>) {
					const [key, question] = Object.entries(questions)[0] as [
						string,
						{ criteria: Record<string, string> },
					];
					asked.push(Object.keys(question.criteria));
					return { [key]: { type: "choice", choice: "reserve" } };
				},
			},
			now: () => 0,
		} as unknown as ReplyDeps;
		const prepared = await prepareNewMessage(
			deps,
			{ id: "u", channelId: "venue" } as VisitorRow,
			"t1",
			"run-1",
			"a table for two",
			{},
		);
		expect(asked[0]).toEqual(["chat", "reserve", "other"]);
		expect(prepared.state.messageIntent).toBe("reserve");
	});
});

describe("pageFacts", () => {
	test("the widget's language wins over the URL's, and says whether the visitor picked it", () => {
		expect(pageFacts("/ru/store", { lang: "en", langChosen: true })).toEqual({
			"page:path": "/ru/store",
			"page:lang": "en",
			"ui:langChosen": true,
		});
		expect(pageFacts("/store", { lang: "kk" })).toEqual({
			"page:path": "/store",
			"page:lang": "kk",
		});
	});

	test("without the widget's language the URL's is used, never as a choice", () => {
		expect(pageFacts("/ru/store")).toEqual({
			"page:path": "/ru/store",
			"page:lang": "ru",
		});
		expect(pageFacts(undefined)).toEqual({});
	});
});

describe("prepareNewMessage: the alpha-understand step", () => {
	const answer = (tasks: unknown[], en = "add 2 cheese") => ({ en, tasks });
	const cheese = {
		intent: "addToCart",
		text: "add 2 cheese",
		items: [{ name: "cheese", quantity: 2 }],
	};

	async function prepare(
		text: string,
		understand: (call: { tool: { description?: string } }) => unknown,
		options: { catalogLang?: string; severalTasks?: boolean } = {},
	) {
		const split: string[] = [];
		const toolDescriptions: string[] = [];
		const withEffects = (name: string, effects: Record<string, boolean>) => ({
			...action(name),
			effects,
		});
		const deps = {
			worldStateStore: new InMemoryWorldStateStore(),
			webmcpCatalog: new Map([
				[
					"t1",
					[
						withEffects("search_products", { catalogSearched: true }),
						withEffects("add_to_cart", { inCart: true }),
					],
				],
			]),
			actions: [],
			intentSets: () => (options.severalTasks ? [] : ["shop"]),
			severalTasks: () => options.severalTasks ?? false,
			catalogLanguage: () => options.catalogLang,
			understandAgent: {
				async fillArguments(call: { tool: { description?: string } }) {
					toolDescriptions.push(call.tool.description ?? "");
					return understand(call);
				},
			},
			functionCallAgent: {
				async fillArguments(call: { request: string }) {
					split.push(call.request);
					throw new Error("unusable");
				},
			},
			decisionAgent: { decide: async () => ({}) },
			now: () => 0,
		} as unknown as ReplyDeps;
		const prepared = await prepareNewMessage(
			deps,
			{ id: "u", channelId: "c" } as VisitorRow,
			"t1",
			"run-1",
			text,
			{},
		);
		return { prepared, split, toolDescriptions };
	}

	test("its answer gives the English text and writes the product facts", async () => {
		const { prepared } = await prepare("добавь два сыра", () =>
			answer([cheese]),
		);
		expect(prepared.state).toMatchObject({
			userMessageEn: "add 2 cheese",
			query: "cheese",
			quantity: 2,
			requestParsed: true,
		});
	});

	test("an unusable answer leaves the message as typed: no English text, no facts", async () => {
		const { prepared } = await prepare("добавь два сыра", () => {
			throw new Error("down");
		});
		expect(prepared.state.userMessage).toBe("добавь два сыра");
		expect(prepared.state.userMessageEn).toBeUndefined();
		expect(prepared.state.quantity).toBeUndefined();
	});

	test("a ru catalog gets Russian item names and the call asks for them", async () => {
		const { prepared, toolDescriptions } = await prepare(
			"добавь два сыра",
			() => answer([{ ...cheese, items: [{ name: "сыр", quantity: 2 }] }]),
			{ catalogLang: "ru" },
		);
		expect(prepared.state).toMatchObject({ query: "сыр", quantity: 2 });
		expect(toolDescriptions[0]).toContain("Russian");
	});

	test("two tasks become a queue without asking delta to split", async () => {
		const { prepared, split } = await prepare(
			"add cheese and look for milk",
			() =>
				answer(
					[
						cheese,
						{
							intent: "search",
							text: "look for milk",
							items: [{ name: "milk", quantity: 1 }],
						},
					],
					"add cheese and look for milk",
				),
			{ severalTasks: true },
		);
		expect(split).toEqual([]);
		expect(prepared.state.userMessageEn).toBe("add 2 cheese");
		expect(prepared.state).toMatchObject({ query: "cheese", quantity: 2 });
		expect(String(prepared.state.taskQueue)).toContain("look for milk");
	});
});
