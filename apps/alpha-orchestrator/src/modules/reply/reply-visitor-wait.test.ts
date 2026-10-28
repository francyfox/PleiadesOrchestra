import { describe, expect, test } from "bun:test";
import type {
	Agent,
	AgentStreamEvent,
	GoapAction,
	IncomingMessage,
} from "@repo/core";
import { createRunLock, InMemoryWorldStateStore } from "@repo/core";
import { mergePresets } from "@repo/intent-presets";
import { createWebChannel } from "../channels/channels.service.ts";
import { testDb } from "../database/database.testing.ts";
import { buildActions } from "../goap/goap.service.ts";
import { RunBinding } from "../run-binding/run-binding.ts";
import { createWidgetThread } from "../threads/threads.service.ts";
import { createVisitor } from "../visitors/visitors.service.ts";
import type { VisitorRow } from "../visitors/visitors.types.ts";
import { ReplyService } from "./reply.ts";
import type { ReplyDeps } from "./reply.types.ts";

// A booking site, not a shop: the tool needs a date that the first message lacks.
const booking = mergePresets([
	{
		id: "booking",
		intents: {
			book: {
				description: "book a slot",
				preconditions: {},
				effects: { booked: true },
			},
			other: { description: "anything else", preconditions: {}, effects: {} },
		},
		messageCues: (message) => (/book/i.test(message) ? "book" : undefined),
	},
]);

type Line = { type: string; [key: string]: unknown };

/** Needs a date in the English request; without one it reports it as missing, like `createWebMcpActions`. */
const bookSlot: GoapAction = {
	name: "bookSlot",
	cost: 1,
	preconditions: {},
	effects: { booked: true, "toolResult:bookSlot": true },
	async execute(ctx) {
		if (ctx.state["webmcp:bookSlot:result"] === "ok")
			return { booked: true, "toolResult:bookSlot": true };
		if (!String(ctx.state.userMessageEn).includes("2026-10-28"))
			return {
				"toolResult:bookSlot": false,
				missingParams: JSON.stringify({
					tool: "bookSlot",
					params: [{ name: "date", description: "day of the visit" }],
				}),
			};
		return {
			waiting: {
				kind: "webmcp_tool_call",
				payload: {
					tool: "bookSlot",
					arguments: { when: String(ctx.state.userMessageEn) },
				},
			},
		};
	},
};

function setup(
	answers: Record<string, Record<string, unknown>>,
	tools: GoapAction[] = [bookSlot],
) {
	const db = testDb();
	const { channel } = createWebChannel(
		db,
		{
			slug: "spa",
			name: "Spa",
			accessMode: "open",
			allowedOrigins: [],
			intentSets: ["booking"],
		},
		0,
	);
	const { visitorId } = createVisitor(db, channel.id, 0, 1e9);
	const visitor = { id: visitorId, channelId: channel.id } as VisitorRow;
	const threadId = createWidgetThread(db, channel.id, visitorId, 0);
	const replies: IncomingMessage[] = [];
	const agent: Agent = {
		async *handleMessageStream(message): AsyncGenerator<AgentStreamEvent> {
			replies.push(message);
			yield { type: "delta", text: "reply" };
			yield { type: "done", elapsedMs: 1 };
		},
		resetThread: async () => {},
	};
	const alphaRequests: string[] = [];
	const worldStateStore = new InMemoryWorldStateStore();
	const service = new ReplyService({
		db,
		agent,
		decisionAgent: { decide: async () => ({}) },
		understandAgent: {
			fillArguments: async ({ request }: { request: string }) => {
				alphaRequests.push(request);
				const message = request.split("Visitor's message: ").at(-1) ?? "";
				return answers[message] as never;
			},
		},
		intentMemory: {
			classify: (_channel: string, text: string) =>
				/book/.test(text)
					? { intent: "book", via: "exact", confidence: 1 }
					: undefined,
		},
		actions: buildActions(agent, 1000),
		runs: new RunBinding(),
		worldStateStore,
		runLock: createRunLock(),
		webmcpCatalog: new Map([[threadId, tools]]),
		taxonomy: () => booking,
		intentSets: () => ["booking"],
		now: () => Date.UTC(2026, 9, 27),
	} as unknown as ReplyDeps);
	return {
		visitor,
		threadId,
		service,
		replies,
		alphaRequests,
		worldStateStore,
	};
}

async function lines(stream: ReadableStream<Uint8Array>): Promise<Line[]> {
	return (await new Response(stream).text())
		.trim()
		.split("\n")
		.filter(Boolean)
		.map((line) => JSON.parse(line));
}

const understood = (en: string, extra: Record<string, unknown> = {}) => ({
	en,
	tasks: [{ intent: "book", text: en, items: [], attributes: [] }],
	...extra,
});

describe("a run that asked the visitor for missing details", () => {
	const first = "book for Danil";

	test("alpha is told today; the reply asks, the checkpoint waits for the visitor and no tool was called", async () => {
		const ctx = setup({ [first]: understood("book for Danil") });
		const out = await lines(
			ctx.service.startReply(ctx.visitor, ctx.threadId, first),
		);
		expect(out.at(-1)?.type).toBe("done");
		expect(out.some((line) => line.type === "tool_call")).toBe(false);
		expect(ctx.alphaRequests[0]).toContain("Today is 2026-10-27 (Tuesday)");
		expect(ctx.replies[0]?.chunks.join(" ") ?? "").toContain(
			"day of the visit",
		);
		expect(ctx.replies[0]?.chunks.join(" ") ?? "").not.toContain(
			"failed (step",
		);
		const saved = await ctx.worldStateStore.load(ctx.threadId);
		expect(JSON.parse(String(saved?.state.visitorWait))).toEqual({
			request: "book for Danil",
			asked: ["day of the visit"],
		});
		expect(saved?.state.awaitedTool).toBeUndefined();
	});

	test("an answer continues the same request: merged text, the tool is called, the wait is gone", async () => {
		const answer = "на 28";
		const ctx = setup({
			[first]: understood("book for Danil"),
			[answer]: understood("on 2026-10-28", { answersPending: true }),
		});
		await lines(ctx.service.startReply(ctx.visitor, ctx.threadId, first));
		const out = await lines(
			ctx.service.startReply(ctx.visitor, ctx.threadId, answer),
		);
		const call = out.at(-1);
		expect(call?.type).toBe("tool_call");
		expect(call?.arguments).toEqual({ when: "book for Danil. on 2026-10-28" });
		expect(ctx.alphaRequests[1]).toContain(
			"asked the visitor for: day of the visit",
		);
		const saved = await ctx.worldStateStore.load(ctx.threadId);
		expect(saved?.state.visitorWait).toBeUndefined();
	});

	test("another topic drops the wait and starts a new run", async () => {
		const other = "hello";
		const ctx = setup({
			[first]: understood("book for Danil"),
			[other]: { en: "hello", tasks: [], answersPending: false },
		});
		await lines(ctx.service.startReply(ctx.visitor, ctx.threadId, first));
		const out = await lines(
			ctx.service.startReply(ctx.visitor, ctx.threadId, other),
		);
		expect(out.at(-1)?.type).toBe("done");
		const saved = await ctx.worldStateStore.load(ctx.threadId);
		expect(saved?.state.visitorWait).toBeUndefined();
	});
});

describe("a run that asked after some steps already ran", () => {
	const first = "book for Danil";
	const answer = "на 28";
	let calls: string[];
	// A write and a read before the step that lacks a date; they need the booking one after them.
	const step = (name: string, fact: string): GoapAction => ({
		name,
		cost: 1,
		preconditions: {},
		effects: { [fact]: true, [`toolResult:${name}`]: true },
		async execute() {
			calls.push(name);
			return { [fact]: true, [`toolResult:${name}`]: true };
		},
	});
	const dependent: GoapAction = {
		...bookSlot,
		preconditions: { added: true, checked: true },
		async execute(ctx) {
			calls.push("bookSlot");
			return bookSlot.execute(ctx);
		},
	};
	const run = async () => {
		calls = [];
		const ctx = setup(
			{
				[first]: understood("book for Danil"),
				[answer]: understood("on 2026-10-28", { answersPending: true }),
			},
			[step("addItem", "added"), step("getAvailability", "checked"), dependent],
		);
		await lines(ctx.service.startReply(ctx.visitor, ctx.threadId, first));
		const asked = [...calls];
		const out = await lines(
			ctx.service.startReply(ctx.visitor, ctx.threadId, answer),
		);
		return { ctx, asked, out };
	};

	test("the write and the read are not repeated after the answer", async () => {
		const { asked, out } = await run();
		expect(asked).toContain("addItem");
		expect(asked).toContain("getAvailability");
		const resumed = calls.slice(asked.length);
		expect(resumed).not.toContain("addItem");
		expect(resumed).not.toContain("getAvailability");
		expect(out.at(-1)?.type).toBe("tool_call");
	});

	test("the failed step is planned again, with the merged request", async () => {
		const { asked, out } = await run();
		expect(calls.slice(asked.length)).toEqual(["bookSlot"]);
		expect(out.at(-1)?.arguments).toEqual({
			when: "book for Danil. on 2026-10-28",
		});
	});

	test("the checkpoint keeps what ran but not the marker or the failure", async () => {
		calls = [];
		const ctx = setup({ [first]: understood("book for Danil") }, [
			step("addItem", "added"),
			step("getAvailability", "checked"),
			dependent,
		]);
		await lines(ctx.service.startReply(ctx.visitor, ctx.threadId, first));
		const saved = await ctx.worldStateStore.load(ctx.threadId);
		expect(saved?.state.added).toBe(true);
		expect(saved?.state["toolResult:addItem"]).toBe(true);
		expect(saved?.state.missingParams).toBeUndefined();
		expect(saved?.state["toolResult:bookSlot"]).toBeUndefined();
		expect(saved?.state.visitorWait).toBeDefined();
	});

	test("the asked parameter's choice step is redone with the answer", async () => {
		calls = [];
		const ctx = setup({ [first]: understood("book for Danil") }, [
			step("addItem", "added"),
			step("chooseDate", "param:bookSlot:date"),
			{
				...dependent,
				preconditions: { added: true, "param:bookSlot:date": true },
			},
		]);
		await lines(ctx.service.startReply(ctx.visitor, ctx.threadId, first));
		const saved = await ctx.worldStateStore.load(ctx.threadId);
		expect(saved?.state.added).toBe(true);
		expect(saved?.state["param:bookSlot:date"]).toBeUndefined();
	});
});
