import { describe, expect, test } from "bun:test";
import { createFunctionCallAgent } from "./function-call-agent.ts";
import type { LlmCallRecord } from "./types.ts";

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
		const { agent, records } = setup(() => new Response("no", { status: 503 }));
		await expect(
			agent.fillArguments({ tool: SEARCH, facts: {}, request: "r" }),
		).rejects.toThrow("503");
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

	test("a transport error is not retried", async () => {
		const { agent, calls } = setup(() => new Response("no", { status: 503 }));
		await expect(
			agent.fillArguments({ tool: SEARCH, facts: {}, request: "r" }),
		).rejects.toThrow("503");
		expect(calls).toHaveLength(1);
	});

	test("thinking is switched off", async () => {
		const { agent, calls } = setup(() => completion('{"query":"a"}'));
		await agent.fillArguments({ tool: SEARCH, facts: {}, request: "a" });
		expect(calls[0]?.body.chat_template_kwargs).toEqual({
			enable_thinking: false,
		});
	});

	test("a request in another language is replaced by a pointer to the facts, but numbers in it still ground the arguments", async () => {
		const tool = {
			name: "search_products",
			inputSchema: {
				type: "object" as const,
				properties: {
					query: { type: "string" },
					max_price: { type: "number" },
				},
				required: ["query"],
			},
		};
		const { agent, calls } = setup(() =>
			completion('{"query":"rice","max_price":3}'),
		);
		const args = await agent.fillArguments({
			tool,
			facts: { query: "rice" },
			request: "найди рис дешевле 3 долларов",
		});
		expect(userPrompt(calls[0]?.body)).toContain("(not in English");
		expect(userPrompt(calls[0]?.body)).not.toContain("рис");
		expect(args).toEqual({ query: "rice", max_price: 3 });
	});
});
