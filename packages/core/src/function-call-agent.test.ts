import { describe, expect, test } from "bun:test";
import {
	createFunctionCallAgent,
	createFunctionCallModel,
	FUNCTION_CALL_SYSTEM_PROMPT,
	fillOnce,
	functionCallMessages,
} from "#core/function-call-agent";
import type { LlmCallRecord } from "#core/types";

const SEARCH = {
	name: "search_products",
	description: "Search the catalog",
	inputSchema: {
		type: "object" as const,
		properties: {
			query: { type: "string" },
			department: { type: "string", enum: ["Dairy", "Bakery"] },
		},
		required: ["query"],
	},
};

function completion(
	content: string,
	usage = { prompt_tokens: 40, completion_tokens: 8 },
) {
	return new Response(
		JSON.stringify({ choices: [{ message: { content } }], usage }),
		{ headers: { "content-type": "application/json" } },
	);
}

function userPrompt(body: Record<string, unknown> | undefined): string {
	const messages = (body?.messages ?? []) as { content: string }[];
	return messages[1]?.content ?? "";
}

function setup(respond: (body: Record<string, unknown>) => Response) {
	const calls: { url: string; body: Record<string, unknown> }[] = [];
	const records: LlmCallRecord[] = [];
	const agent = createFunctionCallAgent({
		baseURL: "http://delta/v1",
		apiKey: "k",
		model: "qwen",
		usageRecorder: { record: (call) => records.push(call) },
		telemetry: { logLlmState() {}, logMessageEvent() {} } as never,
		fetchImpl: (async (input: string | URL | Request, init?: RequestInit) => {
			const body = JSON.parse(String(init?.body));
			calls.push({ url: String(input), body });
			return respond(body);
		}) as typeof fetch,
	});
	return { agent, calls, records };
}

describe("createFunctionCallAgent", () => {
	test("temperature and providerOptions from the config reach the request body", async () => {
		const bodies: Record<string, unknown>[] = [];
		const agent = createFunctionCallAgent({
			baseURL: "http://ollama/v1",
			apiKey: "k",
			model: "qwen3:1.7b-q8_0",
			temperature: 0.2,
			providerOptions: { reasoningEffort: "none" },
			telemetry: { logLlmState() {}, logMessageEvent() {} } as never,
			fetchImpl: (async (
				_input: string | URL | Request,
				init?: RequestInit,
			) => {
				bodies.push(JSON.parse(String(init?.body)));
				return completion('{"query":"cheese"}');
			}) as typeof fetch,
		});
		await agent.fillArguments({
			tool: SEARCH,
			facts: {},
			request: "find cheese",
		});
		expect(bodies[0]?.temperature).toBe(0.2);
		expect(bodies[0]?.reasoning_effort).toBe("none");
		expect(bodies[0]?.model).toBe("qwen3:1.7b-q8_0");
	});

	test("each attempt keeps what was sent, the raw answer and the HTTP retries it took", async () => {
		let busy = 1;
		const raw = ['{"nope":', '{"query":"cheese"}'];
		const answers = [...raw];
		const { agent, records } = setup(() => {
			if (busy-- > 0) return new Response("busy", { status: 429 });
			return completion(answers.shift() ?? "");
		});
		await agent.fillArguments({ tool: SEARCH, facts: {}, request: "cheese" });
		expect(records.map((call) => call.response)).toEqual(raw);
		expect(records.map((call) => call.attempts)).toEqual([2, 1]);
		expect(records[0]?.failedStatuses).toEqual([429]);
		expect(records[1]?.failedStatuses).toBeUndefined();
		// The correction round sees the first answer, so its prompt is longer.
		const sent = records.map((call) => JSON.parse(call.prompt ?? "[]").length);
		expect(sent).toEqual([2, 4]);
	});

	test("temperature is 0 and no reasoning_effort without config", async () => {
		const { agent, calls } = setup(() => completion('{"query":"cheese"}'));
		await agent.fillArguments({ tool: SEARCH, facts: {}, request: "cheese" });
		expect(calls[0]?.body.temperature).toBe(0);
		expect("reasoning_effort" in (calls[0]?.body ?? {})).toBe(false);
	});

	test("asks for JSON constrained to the tool's schema and returns the object", async () => {
		const { agent, calls } = setup(() => completion('{"query":"cheese"}'));
		const args = await agent.fillArguments({
			tool: SEARCH,
			facts: { query: "cheese", quantity: 1 },
			request: "buy cheese",
		});
		expect(args).toEqual({ query: "cheese" });
		const [call] = calls;
		expect(call?.url).toBe("http://delta/v1/chat/completions");
		expect(call?.body.temperature).toBe(0);
		expect(call?.body.response_format).toEqual({
			type: "json_schema",
			json_schema: {
				name: "arguments",
				strict: true,
				schema: SEARCH.inputSchema,
			},
		});
		const user = userPrompt(call?.body);
		expect(user).toContain("Tool: search_products");
		expect(user).toContain('"quantity":1');
		expect(user).toContain("Request: buy cheese");
	});

	test("the last tool answer goes into the prompt", async () => {
		const { agent, calls } = setup(() => completion('{"query":"x"}'));
		await agent.fillArguments({
			tool: SEARCH,
			facts: {},
			lastAnswer: "- Swiss Cheese — in stock",
			request: "r",
		});
		const user = userPrompt(calls[0]?.body);
		expect(user).toContain("- Swiss Cheese — in stock");
	});

	test("drops optional fields the request gives no reason for", async () => {
		const { agent } = setup(() =>
			completion('{"query":"cheese","department":"Dairy"}'),
		);
		const args = await agent.fillArguments({
			tool: SEARCH,
			facts: {},
			request: "buy 1 cheese",
		});
		expect(args).toEqual({ query: "cheese" });
	});

	test("drops fields the tool's schema does not have", async () => {
		const { agent } = setup(() =>
			completion('{"query":"cheese","sizes":"all","topping":"tomato"}'),
		);
		const args = await agent.fillArguments({
			tool: SEARCH,
			facts: {},
			request: "what sizes of cheese are there",
		});
		expect(args).toEqual({ query: "cheese" });
	});

	test("records the call in the usage ledger as a decision by delta", async () => {
		const { agent, records } = setup(() => completion('{"query":"a"}'));
		await agent.fillArguments({
			tool: SEARCH,
			facts: {},
			request: "a",
			context: {
				threadId: "t",
				userId: "u",
				planRunId: "p",
				actionName: "search_products",
			},
		});
		expect(records).toHaveLength(1);
		expect(records[0]).toMatchObject({
			kind: "decision",
			provider: "delta",
			model: "qwen",
			ok: true,
			inputTokens: 40,
			outputTokens: 8,
			threadId: "t",
			planRunId: "p",
			actionName: "search_products",
		});
	});

	test("a reply that is not a JSON object throws and is recorded as failed", async () => {
		const { agent, records } = setup(() => completion("sorry"));
		await expect(
			agent.fillArguments({ tool: SEARCH, facts: {}, request: "r" }),
		).rejects.toThrow();
		expect(records[0]?.ok).toBe(false);
	});

	test("an HTTP error throws and is recorded as failed", async () => {
		const { agent, records } = setup(() => new Response("no", { status: 400 }));
		await expect(
			agent.fillArguments({ tool: SEARCH, facts: {}, request: "r" }),
		).rejects.toThrow("400");
		expect(records[0]?.ok).toBe(false);
	});

	test("an answer that breaks the schema is sent back with the problems named", async () => {
		const answers = ["{}", '{"query":"cheese"}'];
		const { agent, calls, records } = setup(() =>
			completion(answers.shift() as string),
		);
		const args = await agent.fillArguments({
			tool: SEARCH,
			facts: {},
			request: "buy cheese",
		});
		expect(args).toEqual({ query: "cheese" });
		expect(calls).toHaveLength(2);
		const retry = calls[1]?.body.messages as {
			role: string;
			content: string;
		}[];
		expect(retry.at(-2)).toEqual({ role: "assistant", content: "{}" });
		expect(retry.at(-1)?.role).toBe("user");
		expect(retry.at(-1)?.content).toContain("query is required");
		expect(records.map((record) => record.ok)).toEqual([false, true]);
	});

	test("what the formatter can fix never reaches the model again", async () => {
		const { agent, calls } = setup(() =>
			completion('```json\n{"query":"cheese",}\n```'),
		);
		expect(
			await agent.fillArguments({ tool: SEARCH, facts: {}, request: "r" }),
		).toEqual({ query: "cheese" });
		expect(calls).toHaveLength(1);
	});

	test("a string cut off mid-way is sent back, not completed", async () => {
		const answers = ['{"query":"che', '{"query":"cheese"}'];
		const { agent, calls } = setup(() => completion(answers.shift() as string));
		expect(
			await agent.fillArguments({ tool: SEARCH, facts: {}, request: "r" }),
		).toEqual({ query: "cheese" });
		expect(calls).toHaveLength(2);
	});

	test("the model gets a second correction before giving up", async () => {
		const answers = ["{}", '{"query":5}', '{"query":"cheese"}'];
		const { agent, calls } = setup(() => completion(answers.shift() as string));
		expect(
			await agent.fillArguments({ tool: SEARCH, facts: {}, request: "r" }),
		).toEqual({ query: "cheese" });
		expect(calls).toHaveLength(3);
		const last = calls[2]?.body.messages as { role: string; content: string }[];
		expect(last).toHaveLength(6);
		expect(last.at(-1)?.content).toContain("query must be string");
	});

	test("still invalid after the corrections: throws with the problems", async () => {
		const { agent, calls } = setup(() => completion("{}"));
		await expect(
			agent.fillArguments({ tool: SEARCH, facts: {}, request: "r" }),
		).rejects.toThrow("query is required");
		expect(calls).toHaveLength(3);
	});

	// 429/5xx are retried by the SDK (`maxRetries`); a request the server rejects is not.
	test("a rejected request is not retried", async () => {
		const { agent, calls } = setup(() => new Response("no", { status: 400 }));
		await expect(
			agent.fillArguments({ tool: SEARCH, facts: {}, request: "r" }),
		).rejects.toThrow("400");
		expect(calls).toHaveLength(1);
	});

	test("thinking is switched off", async () => {
		const { agent, calls } = setup(() => completion('{"query":"a"}'));
		await agent.fillArguments({ tool: SEARCH, facts: {}, request: "a" });
		expect(calls[0]?.body.chat_template_kwargs).toEqual({
			enable_thinking: false,
		});
	});
});

describe("functionCallMessages", () => {
	// apps/benchmark measures exactly these messages, so they are one export.
	test("the system rules, then one user message with tool, facts, last answer and request", () => {
		const [system, user, ...rest] = functionCallMessages({
			tool: SEARCH,
			facts: { quantity: 2 },
			lastAnswer: "- Wool Socks — in stock",
			request: "two pairs of socks",
		});
		expect(rest).toHaveLength(0);
		expect(system).toEqual({
			role: "system",
			content: FUNCTION_CALL_SYSTEM_PROMPT,
		});
		expect(user?.role).toBe("user");
		expect(user?.content).toBe(
			[
				"Tool: search_products",
				"What it does: Search the catalog",
				'Known facts: {"quantity":2}',
				"Last tool answer:",
				"- Wool Socks — in stock",
				"Request: two pairs of socks",
			].join("\n"),
		);
	});

	test("no last answer is marked absent", () => {
		const user = functionCallMessages({
			tool: SEARCH,
			facts: {},
			request: "find socks",
		})[1];
		expect(user?.content).toContain("Last tool answer:\n(none)");
	});
});

describe("FUNCTION_CALL_SYSTEM_PROMPT", () => {
	// The prompt is shared by every site; what a site sells comes from its own
	// tools and schemas (CLAUDE.md, "not one shop").
	test("names no kind of shop and no product", () => {
		expect(FUNCTION_CALL_SYSTEM_PROMPT).not.toMatch(
			/grocer|shop|store|cart|recipe|dairy|frozen|vegan|\brice\b|lemon|tofu|sausage/i,
		);
	});

	test("its examples come from different domains", () => {
		const examples = FUNCTION_CALL_SYSTEM_PROMPT.split("\n").filter((line) =>
			line.startsWith("Request:"),
		);
		expect(examples.length).toBeGreaterThanOrEqual(4);
		expect(FUNCTION_CALL_SYSTEM_PROMPT).toMatch(/laptop|headphones/i);
		expect(FUNCTION_CALL_SYSTEM_PROMPT).toMatch(/hotel|flight|room/i);
		expect(FUNCTION_CALL_SYSTEM_PROMPT).toMatch(/jacket|shirt|shoes/i);
	});
});

describe("fillOnce (wire level)", () => {
	function capture(content: string) {
		const bodies: Record<string, unknown>[] = [];
		const model = createFunctionCallModel({
			baseURL: "http://delta/v1",
			model: "qwen",
			fetch: (async (_url: string | URL | Request, init?: RequestInit) => {
				bodies.push(JSON.parse(String(init?.body)));
				return completion(content);
			}) as typeof fetch,
		});
		return { model, bodies };
	}
	const messages = [
		{ role: "system" as const, content: "rules" },
		{ role: "user" as const, content: "go" },
	];

	test("the request body carries the schema, thinking off, limits, model and messages", async () => {
		const { model, bodies } = capture('{"query":"a"}');
		const result = await fillOnce({
			model,
			messages,
			schema: SEARCH.inputSchema,
			maxOutputTokens: 77,
		});
		expect(result.text).toBe('{"query":"a"}');
		expect(result.usage).toEqual({ inputTokens: 40, outputTokens: 8 });
		const body = bodies[0] as Record<string, unknown>;
		expect(body.model).toBe("qwen");
		expect(body.temperature).toBe(0);
		expect(body.max_tokens).toBe(77);
		expect(body.chat_template_kwargs).toEqual({ enable_thinking: false });
		expect(body.response_format).toMatchObject({
			type: "json_schema",
			json_schema: { strict: true, schema: SEARCH.inputSchema },
		});
		expect(body.messages).toEqual(messages);
	});

	test("caller extras reach the body next to the defaults", async () => {
		const { model, bodies } = capture('{"query":"a"}');
		await fillOnce({
			model,
			messages,
			schema: SEARCH.inputSchema,
			maxOutputTokens: 10,
			providerOptions: { reasoningEffort: "none", top_k: 5 },
		});
		const body = bodies[0] as Record<string, unknown>;
		expect(body.reasoning_effort).toBe("none");
		expect(body.top_k).toBe(5);
		expect(body.chat_template_kwargs).toEqual({ enable_thinking: false });
	});

	test("temperature defaults to 0 and can be set", async () => {
		const { model, bodies } = capture('{"query":"a"}');
		await fillOnce({
			model,
			messages,
			schema: SEARCH.inputSchema,
			maxOutputTokens: 10,
			temperature: 0.4,
		});
		expect(bodies[0]?.temperature).toBe(0.4);
	});

	test("text that is not valid JSON is returned, not thrown", async () => {
		const { model } = capture("sorry, no");
		const result = await fillOnce({
			model,
			messages,
			schema: SEARCH.inputSchema,
			maxOutputTokens: 10,
		});
		expect(result.text).toBe("sorry, no");
	});
});
