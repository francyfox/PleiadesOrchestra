import { describe, expect, test } from "bun:test";
import type { TraceEvent } from "../plan-runs/plan-runs.schema.ts";
import type { UpstreamRequestDetails } from "./requests.schema.ts";
import {
	buildWebMcpTrace,
	catalogOf,
	TRACE_TOOL_PREFIX,
} from "./requests.trace.ts";

// parsed JSON, shape asserted by the tests
type Turn = ReturnType<typeof JSON.parse>;

let seq = 0;
const ev = (
	type: TraceEvent["type"],
	action: string | null,
	payload: Record<string, unknown>,
): TraceEvent => ({ seq: seq++, type, attempt: 0, action, payload, at: seq });

const planned = (state: Record<string, unknown>) =>
	ev("planned", null, { plan: [], totalCost: 0, state });
const waiting = (tool: string, args: object, state: object = {}) =>
	ev("waiting", tool, {
		waiting: { kind: "webmcp_tool_call", payload: { tool, arguments: args } },
		state,
	});

const run = (id: string, events: TraceEvent[]) => ({
	id,
	createdAt: 0,
	durationMs: 10,
	succeeded: true,
	running: false,
	events,
});

const call = (
	planRunId: string,
	model: string,
	inputTokens: number | null,
	outputTokens: number | null,
) => ({
	planRunId,
	actionName: null,
	kind: "generate",
	provider: "local",
	model,
	inputTokens,
	outputTokens,
	latencyMs: 5,
	ok: true,
	error: null,
	at: 0,
});

const details = (
	over: Partial<UpstreamRequestDetails["request"]>,
	runs: UpstreamRequestDetails["runs"],
	llmCalls: UpstreamRequestDetails["llmCalls"] = [],
): UpstreamRequestDetails => ({
	request: {
		id: "r1",
		visitorId: "u",
		threadId: "t",
		prompt: "order a blue jacket size M",
		intent: "addToCart",
		status: "succeeded",
		goal: {},
		reply: "Added the jacket.",
		startedAt: 0,
		durationMs: 100,
		...over,
	},
	runs,
	llmCalls,
	now: 1,
});

const TOOLS = [
	{
		name: "find_items",
		description: "Search the catalog",
		inputSchema: { type: "object", properties: { q: { type: "string" } } },
	},
	{ name: "add_item" },
];

// two browser round trips: find_items, then add_item (clothes shop, not groceries)
const twoCalls = () =>
	details(
		{},
		[
			run("a", [
				planned({ channelId: "ch1" }),
				waiting("find_items", { q: "blue jacket" }, { channelId: "ch1" }),
			]),
			run("b", [
				planned({
					"webmcp:find_items:result": "ok",
					"webmcp:find_items:text": "1 result: Blue Jacket M",
				}),
				waiting("add_item", { sku: "J-1" }),
			]),
			run("c", [
				planned({
					"webmcp:find_items:text": "1 result: Blue Jacket M",
					"webmcp:add_item:result": "error",
					"webmcp:add_item:text": "Out of stock",
				}),
			]),
		],
		[call("a", "tiny-1b", 100, 10), call("a", "classifier", null, null)],
	);

describe("buildWebMcpTrace", () => {
	test("alternates userPrompt and response like the inspector export", () => {
		const trace = buildWebMcpTrace(twoCalls(), TOOLS) as Turn[];
		expect(trace.map((t) => Object.keys(t)[0])).toEqual([
			"userPrompt",
			"response",
			"userPrompt",
			"response",
			"userPrompt",
			"response",
		]);
		expect(trace[0].userPrompt.message).toBe("order a blue jacket size M");
		const first = trace[1].response.candidates[0];
		expect(first.content).toEqual({
			role: "model",
			parts: [
				{
					functionCall: {
						name: `${TRACE_TOOL_PREFIX}find_items`,
						args: { q: "blue jacket" },
						id: "call_1",
					},
				},
			],
		});
		expect(first.finishReason).toBe("STOP");
		expect(first.index).toBe(0);
	});

	test("the browser's answer is a functionResponse with the MCP result as a string", () => {
		const trace = buildWebMcpTrace(twoCalls(), TOOLS) as Turn[];
		const [part] = trace[2].userPrompt.message;
		expect(part.functionResponse.name).toBe(`${TRACE_TOOL_PREFIX}find_items`);
		expect(JSON.parse(part.functionResponse.response.result)).toEqual({
			content: [{ type: "text", text: "1 result: Blue Jacket M" }],
		});
		const failed = trace[4].userPrompt.message[0].functionResponse.response;
		expect(JSON.parse(failed.result)).toEqual({
			content: [{ type: "text", text: "Out of stock" }],
			isError: true,
		});
	});

	test("ends with the reply text; tools are declared on every turn", () => {
		const trace = buildWebMcpTrace(twoCalls(), TOOLS) as Turn[];
		expect(trace.at(-1).response.candidates[0].content.parts).toEqual([
			{ text: "Added the jacket." },
		]);
		for (const turn of trace.filter((t) => t.userPrompt)) {
			const [{ functionDeclarations }] = turn.userPrompt.config.tools;
			expect(functionDeclarations).toEqual([
				{
					name: "_0_find_items",
					description: "Search the catalog",
					parametersJsonSchema: {
						type: "object",
						properties: { q: { type: "string" } },
					},
				},
				{
					name: "_0_add_item",
					description: "",
					parametersJsonSchema: { type: "object", properties: {} },
				},
			]);
			expect(turn.userPrompt.config.systemInstruction).toEqual([]);
		}
	});

	test("modelVersion names the models; usage is summed per run, omitted without tokens", () => {
		const trace = buildWebMcpTrace(twoCalls(), TOOLS) as Turn[];
		const r1 = trace[1].response;
		expect(r1.modelVersion).toBe("pleiades-goap (tiny-1b, classifier)");
		expect(r1.usageMetadata).toEqual({
			promptTokenCount: 100,
			candidatesTokenCount: 10,
			totalTokenCount: 110,
		});
		expect(trace[3].response.usageMetadata).toBeUndefined();
	});

	test("a request without browser tools is prompt plus reply", () => {
		const trace = buildWebMcpTrace(
			details({}, [run("a", [planned({})])]),
			[],
		) as Turn[];
		expect(trace).toHaveLength(2);
		expect(trace[0].userPrompt.config).toEqual({
			systemInstruction: [],
			tools: [],
		});
	});

	test("a request stuck on a tool has no answer and no reply", () => {
		const trace = buildWebMcpTrace(
			details({ reply: null, status: "waiting" }, [
				run("a", [planned({}), waiting("find_items", {})]),
			]),
			TOOLS,
		) as Turn[];
		expect(trace).toHaveLength(2);
		expect(
			trace[1].response.candidates[0].content.parts[0].functionCall,
		).toBeDefined();
	});
});

describe("catalogOf", () => {
	// One channel serving two sites (the playground): a grocery catalog and a pizza one.
	const sites = [
		{ channelId: "other", tools: [{ name: "set_pizza_size" }] },
		{ channelId: "ch1", tools: [{ name: "search_products" }] },
		{
			channelId: "ch1",
			tools: [{ name: "set_pizza_size" }, { name: "add_pizza" }],
		},
	];

	test("the channel's catalog that has the tools the request called, not the first one", () => {
		const pizza = details({}, [
			run("a", [planned({ channelId: "ch1" }), waiting("set_pizza_size", {})]),
		]);
		expect(catalogOf(pizza, sites).map((t) => t.name)).toEqual([
			"set_pizza_size",
			"add_pizza",
		]);
	});

	test("no browser call: the channel's first catalog; no channel: none", () => {
		const chat = details({}, [run("a", [planned({ channelId: "ch1" })])]);
		expect(catalogOf(chat, sites).map((t) => t.name)).toEqual([
			"search_products",
		]);
		expect(catalogOf(details({}, [run("a", [planned({})])]), sites)).toEqual(
			[],
		);
	});
});
