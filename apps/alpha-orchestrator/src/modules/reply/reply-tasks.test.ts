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
import { planRuns } from "../database/database.schema.ts";
import { testDb } from "../database/database.testing.ts";
import { buildActions } from "../goap/goap.service.ts";
import { RunBinding } from "../run-binding/run-binding.ts";
import { createWidgetThread } from "../threads/threads.service.ts";
import { createVisitor } from "../visitors/visitors.service.ts";
import type { VisitorRow } from "../visitors/visitors.types.ts";
import { ReplyService } from "./reply.ts";
import type { ReplyDeps } from "./reply.types.ts";

// A hotel site, not a shop: the queue knows nothing of products.
const intent = (description: string, effects = {}, extra = {}) => ({
	description,
	preconditions: {},
	effects,
	...extra,
});
const booking = mergePresets([
	{
		id: "booking",
		intents: {
			findRoom: intent("look for rooms", { roomFound: true }),
			book: intent("book a room", { booked: true }),
			cancel: intent(
				"cancel a booking",
				{ booked: false },
				{ needsWords: true },
			),
			other: intent("anything else"),
		},
		messageCues: (message) =>
			/\bcancel\b/i.test(message) ? "cancel" : undefined,
		taskConflicts: { pairs: [["book", "cancel"]], lastOnly: [] },
	},
]);

type Line = { type: string; [key: string]: unknown };

/** A site tool that always asks the browser to run it; `page` marks which catalog it came from. */
const browserTool = (
	name: string,
	effects: Record<string, boolean>,
	page = "v1",
): GoapAction => ({
	name,
	cost: 1,
	preconditions: {},
	effects: { ...effects, [`toolResult:${name}`]: true },
	async execute(ctx) {
		const answer = ctx.state[`webmcp:${name}:result`];
		if (answer === "ok") return { ...effects, [`toolResult:${name}`]: true };
		if (answer === "error") return { [`toolResult:${name}`]: false };
		return {
			waiting: {
				kind: "webmcp_tool_call",
				payload: { tool: name, arguments: { page } },
			},
		};
	},
});

const catalog = (page = "v1") => [
	browserTool("find_rooms", { roomFound: true }, page),
	browserTool("book_room", { booked: true }, page),
	browserTool("cancel_booking", { booked: false }, page),
];

function setup(tasks: unknown) {
	const db = testDb();
	const { channel } = createWebChannel(
		db,
		{
			slug: "hotel",
			name: "Hotel",
			accessMode: "open",
			allowedOrigins: [],
			intentSets: ["booking"],
		},
		0,
	);
	const { visitorId } = createVisitor(db, channel.id, 0, 1e9);
	const visitor = { id: visitorId, channelId: channel.id } as VisitorRow;
	const threadId = createWidgetThread(db, channel.id, visitorId, 0);
	const replyInputs: IncomingMessage[] = [];
	const agent: Agent = {
		async *handleMessageStream(message): AsyncGenerator<AgentStreamEvent> {
			replyInputs.push(message);
			yield { type: "delta", text: "reply" };
			yield { type: "done", elapsedMs: 1 };
		},
		resetThread: async () => {},
	};
	const webmcpCatalog = new Map<string, GoapAction[]>([[threadId, catalog()]]);
	const service = new ReplyService({
		db,
		agent,
		decisionAgent: { decide: async () => ({}) },
		functionCallAgent: {
			fillArguments: async () => {
				if (tasks === undefined) throw new Error("unusable");
				return { tasks } as never;
			},
		},
		actions: buildActions(agent, 1000),
		runs: new RunBinding(),
		worldStateStore: new InMemoryWorldStateStore(),
		runLock: createRunLock(),
		webmcpCatalog,
		taxonomy: () => booking,
		intentSets: () => ["booking"],
		now: () => 1,
	} as unknown as ReplyDeps);
	return { db, visitor, threadId, service, webmcpCatalog, replyInputs };
}

async function lines(stream: ReadableStream<Uint8Array>): Promise<Line[]> {
	return (await new Response(stream).text())
		.trim()
		.split("\n")
		.filter(Boolean)
		.map((line) => JSON.parse(line));
}

/** What the widget does: answer every `tool_call` until the stream ends otherwise. */
async function converse(
	ctx: ReturnType<typeof setup>,
	text: string,
	answer: (tool: string) => { isError: boolean } = () => ({ isError: false }),
	afterAnswer: (tool: string) => void = () => {},
): Promise<Line[]> {
	const all: Line[] = [];
	let batch = await lines(
		ctx.service.startReply(ctx.visitor, ctx.threadId, text),
	);
	all.push(...batch);
	for (let i = 0; i < 8 && batch.at(-1)?.type === "tool_call"; i++) {
		const call = batch.at(-1) as Line;
		const tool = String(call.tool);
		const { isError } = answer(tool);
		afterAnswer(tool);
		batch = await lines(
			ctx.service.resumeReply(ctx.visitor, ctx.threadId, {
				callId: String(call.callId),
				tool,
				result: `${tool} finished`,
				isError,
			}),
		);
		all.push(...batch);
	}
	return all;
}

const askedTools = (all: Line[]) =>
	all.filter((line) => line.type === "tool_call").map((line) => line.tool);
const terminals = (all: Line[]) =>
	all.filter((line) => ["done", "error"].includes(line.type));

describe("several tasks in one message", () => {
	const two = [
		{ intent: "findRoom", text: "find a room in Rome" },
		{ intent: "book", text: "book the sea view suite" },
	];

	test("two tasks that each need the browser run in order inside one response chain, one done, one reply that knows both", async () => {
		const ctx = setup(two);
		const all = await converse(
			ctx,
			"find a room in Rome and book the sea view suite",
		);
		expect(askedTools(all)).toEqual(["find_rooms", "book_room"]);
		expect(terminals(all)).toEqual([expect.objectContaining({ type: "done" })]);
		expect(all.at(-1)?.type).toBe("done");
		// Progress runs 0 → 1 → 2 of 2 and the last line before `done` is 2 of 2.
		const progress = all.filter((line) => line.type === "progress");
		const counts = progress.map((line) => line.done as number);
		expect(counts).toEqual([...counts].sort());
		expect(progress.every((line) => line.total === 2)).toBe(true);
		expect(progress.at(-1)).toMatchObject({ done: 2, total: 2 });
		expect(all.at(-2)).toBe(progress.at(-1));
		// The text model is asked once, after the last task, and sees both.
		expect(ctx.replyInputs).toHaveLength(1);
		const prompt = ctx.replyInputs[0]?.chunks.join(" ") ?? "";
		expect(prompt).toContain("«find a room in Rome» — done");
		expect(prompt).toContain("book the sea view suite");
		// One request in the admin's flow: every run shares the root.
		const rows = ctx.db.select().from(planRuns).all();
		expect(rows.length).toBeGreaterThanOrEqual(4);
		expect(new Set(rows.map((row) => row.rootRunId)).size).toBe(1);
	});

	test("the catalog is read again before each task", async () => {
		const ctx = setup(two);
		const all = await converse(
			ctx,
			"find a room in Rome and book the sea view suite",
			undefined,
			(tool) => {
				// The first tool opened another page: the widget announces its catalog.
				if (tool === "find_rooms")
					ctx.webmcpCatalog.set(ctx.threadId, catalog("v2"));
			},
		);
		const calls = all.filter((line) => line.type === "tool_call");
		expect(calls.map((call) => call.arguments)).toEqual([
			{ page: "v1" },
			{ page: "v2" },
		]);
	});

	test("a task that failed is told as not done, the others still run", async () => {
		const ctx = setup(two);
		const all = await converse(
			ctx,
			"find a room in Rome and book the sea view suite",
			(tool) => ({ isError: tool === "find_rooms" }),
		);
		expect(askedTools(all)).toContain("book_room");
		expect(terminals(all)).toHaveLength(1);
		expect(ctx.replyInputs[0]?.chunks.join(" ")).toContain("NOT done");
	});

	test("the queue waits in the checkpoint while the browser runs a tool", async () => {
		const ctx = setup(two);
		const first = await lines(
			ctx.service.startReply(
				ctx.visitor,
				ctx.threadId,
				"find a room in Rome and book the sea view suite",
			),
		);
		expect(first.at(-1)?.type).toBe("tool_call");
		const saved = await (
			ctx.service as unknown as { deps: ReplyDeps }
		).deps.worldStateStore.load(ctx.threadId);
		expect(JSON.parse(String(saved?.state.taskQueue))).toEqual([two[1]]);
	});

	test("a cancel the words do not confirm is dropped, the rest runs as a single task", async () => {
		const ctx = setup([
			two[0],
			{ intent: "cancel", text: "look at the other offers" },
		]);
		const all = await converse(
			ctx,
			"find a room in Rome and look at the other offers",
		);
		expect(askedTools(all)).toEqual(["find_rooms"]);
		expect(terminals(all)).toHaveLength(1);
	});

	test("book and cancel without an order word: nothing runs, the reply asks", async () => {
		const ctx = setup([
			{ intent: "book", text: "book the sea view suite" },
			{ intent: "cancel", text: "cancel my Friday booking" },
		]);
		const all = await converse(
			ctx,
			"book the sea view suite and cancel my Friday booking",
		);
		expect(askedTools(all)).toEqual([]);
		expect(terminals(all)).toHaveLength(1);
		expect(ctx.replyInputs[0]?.chunks.join(" ")).toContain(
			"depend on their order",
		);
	});

	test("the same with «then» runs in the order said", async () => {
		const ctx = setup([
			{ intent: "book", text: "book the sea view suite" },
			{ intent: "cancel", text: "cancel my Friday booking" },
		]);
		const all = await converse(
			ctx,
			"book the sea view suite, then cancel my Friday booking",
		);
		expect(askedTools(all)).toEqual(["book_room", "cancel_booking"]);
		expect(terminals(all)).toHaveLength(1);
	});

	test("no usable decomposition keeps the single path", async () => {
		const ctx = setup(undefined);
		const all = await converse(ctx, "find a room in Rome and book it");
		expect(askedTools(all)).toEqual([]);
		expect(terminals(all)).toHaveLength(1);
	});

	test("one task keeps the single path", async () => {
		const ctx = setup([two[0]]);
		const all = await converse(ctx, "find a room in Rome, please");
		expect(all.some((line) => line.type === "progress")).toBe(false);
		expect(askedTools(all)).toEqual([]);
		expect(terminals(all)).toHaveLength(1);
	});
});
