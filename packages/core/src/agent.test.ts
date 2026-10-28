import { afterEach, describe, expect, test } from "bun:test";
import { createAgent } from "./agent";
import { InMemoryHistoryStore } from "./history";
import { createTelemetry } from "./telemetry";
import type {
	AgentStreamEvent,
	IncomingMessage,
	LlmCallRecord,
	UsageRecorder,
} from "./types";

interface Usage {
	prompt_tokens: number;
	completion_tokens: number;
}

/**
 * Minimal OpenAI-compatible fake: non-streamed completions answer ingest
 * passes, streamed ones answer the final generation. `usage: null` omits
 * usage from the response, like a provider that doesn't report it.
 */
function fakeLlm(options: {
	ingestUsage?: Usage | null;
	finalUsage?: Usage | null;
	failFinal?: boolean;
	/** The final generation answers 429 this many times before it works. */
	overloaded?: number;
}) {
	let overloaded = options.overloaded ?? 0;
	const requests: {
		stream: boolean;
		messages: unknown[];
		body: Record<string, unknown>;
	}[] = [];
	const server = Bun.serve({
		port: 0,
		async fetch(request) {
			const body = (await request.json()) as {
				stream?: boolean;
				messages: unknown[];
			};
			requests.push({
				stream: Boolean(body.stream),
				messages: body.messages,
				body: body as Record<string, unknown>,
			});

			if (!body.stream) {
				const usage =
					options.ingestUsage === undefined
						? { prompt_tokens: 10, completion_tokens: 2 }
						: options.ingestUsage;
				return Response.json({
					id: "x",
					object: "chat.completion",
					created: 0,
					model: "m",
					choices: [
						{
							index: 0,
							message: { role: "assistant", content: "digest" },
							finish_reason: "stop",
						},
					],
					...(usage ? { usage: { ...usage, total_tokens: 0 } } : {}),
				});
			}

			if (overloaded > 0) {
				overloaded -= 1;
				return new Response("busy", { status: 429 });
			}
			if (options.failFinal) {
				return new Response("boom", { status: 400 });
			}

			const usage =
				options.finalUsage === undefined
					? { prompt_tokens: 20, completion_tokens: 5 }
					: options.finalUsage;
			const chunk = (payload: object) => `data: ${JSON.stringify(payload)}\n\n`;
			const base = {
				id: "x",
				object: "chat.completion.chunk",
				created: 0,
				model: "m",
			};
			const sse =
				chunk({
					...base,
					choices: [
						{
							index: 0,
							delta: { role: "assistant", content: "Hi" },
							finish_reason: null,
						},
					],
				}) +
				chunk({
					...base,
					choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
				}) +
				(usage
					? chunk({
							...base,
							choices: [],
							usage: { ...usage, total_tokens: 0 },
						})
					: "") +
				"data: [DONE]\n\n";
			return new Response(sse, {
				headers: { "content-type": "text/event-stream" },
			});
		},
	});
	return { server, requests };
}

function recorder(): UsageRecorder & { calls: LlmCallRecord[] } {
	const calls: LlmCallRecord[] = [];
	return { calls, record: (call) => calls.push(call) };
}

const silentTelemetry = createTelemetry([]);

let stop: (() => void) | undefined;
afterEach(() => stop?.());

function setup(
	options: Parameters<typeof fakeLlm>[0] = {},
	agentConfig: { maxHistoryMessages?: number; temperature?: number } = {},
) {
	const llm = fakeLlm(options);
	stop = () => llm.server.stop(true);
	const usageRecorder = recorder();
	const historyStore = new InMemoryHistoryStore(10);
	const agent = createAgent({
		baseURL: `http://localhost:${llm.server.port}/v1`,
		apiKey: "k",
		model: "test-model",
		telemetry: silentTelemetry,
		historyStore,
		usageRecorder,
		...agentConfig,
	});
	return { llm, agent, usageRecorder, historyStore };
}

async function collect(
	stream: AsyncIterable<AgentStreamEvent>,
): Promise<AgentStreamEvent[]> {
	const events: AgentStreamEvent[] = [];
	for await (const event of stream) events.push(event);
	return events;
}

const message = (
	overrides: Partial<IncomingMessage> = {},
): IncomingMessage => ({
	threadId: "t1",
	userId: "u1",
	chunks: ["hello"],
	...overrides,
});

describe("createAgent", () => {
	test("temperature goes on the wire of every call when set", async () => {
		const { llm, agent } = setup({}, { temperature: 0.3 });
		await collect(
			agent.handleMessageStream(message({ chunks: ["long part", "last"] })),
		);
		expect(llm.requests).toHaveLength(2);
		for (const request of llm.requests) {
			expect(request.body.temperature).toBe(0.3);
		}
	});

	test("without a temperature nothing is sent: the server default applies", async () => {
		const { llm, agent } = setup();
		await collect(
			agent.handleMessageStream(message({ chunks: ["long part", "last"] })),
		);
		for (const request of llm.requests) {
			expect("temperature" in request.body).toBe(false);
		}
	});

	test("records one generate call with context fields and token usage", async () => {
		const { agent, usageRecorder } = setup();

		await collect(
			agent.handleMessageStream(
				message({ planRunId: "run-1", actionName: "generateReply" }),
			),
		);

		expect(usageRecorder.calls).toHaveLength(1);
		expect(usageRecorder.calls[0]).toMatchObject({
			kind: "generate",
			threadId: "t1",
			userId: "u1",
			planRunId: "run-1",
			actionName: "generateReply",
			provider: "albedo",
			model: "test-model",
			inputTokens: 20,
			outputTokens: 5,
			ok: true,
		});
	});

	test("keeps the prompt and the raw answer of a call, and the retries the SDK made", async () => {
		const { agent, usageRecorder } = setup({ overloaded: 1 });

		await collect(
			agent.handleMessageStream(message({ systemPrompt: "Be brief." })),
		);

		const call = usageRecorder.calls[0];
		expect(JSON.parse(call?.prompt ?? "")).toEqual([
			{ role: "system", content: "Be brief." },
			{ role: "user", content: "hello" },
		]);
		expect(call?.response).toBeString();
		expect(call).toMatchObject({ attempts: 2, failedStatuses: [429] });
	});

	test("a call that never got through still says how it was tried", async () => {
		const { agent, usageRecorder } = setup({ failFinal: true });

		await expect(
			collect(agent.handleMessageStream(message())),
		).rejects.toThrow();

		const call = usageRecorder.calls[0];
		expect(call?.prompt).toContain("hello");
		expect(call).toMatchObject({ attempts: 1, failedStatuses: [400] });
		expect(call?.response).toBeUndefined();
	});

	test("records every ingest pass and sums totals across all calls in done", async () => {
		const { agent, usageRecorder } = setup();

		const events = await collect(
			agent.handleMessageStream(message({ chunks: ["a", "b", "c"] })),
		);

		expect(usageRecorder.calls.map((call) => call.kind)).toEqual([
			"ingest",
			"ingest",
			"generate",
		]);
		const done = events.find((event) => event.type === "done");
		expect(done).toMatchObject({
			inputTokens: 20,
			outputTokens: 5,
			totalInputTokens: 40,
			totalOutputTokens: 9,
		});
	});

	test("keeps missing usage undefined and leaves totals undefined", async () => {
		const { agent, usageRecorder } = setup({ ingestUsage: null });

		const events = await collect(
			agent.handleMessageStream(message({ chunks: ["a", "b"] })),
		);

		expect(usageRecorder.calls[0]?.inputTokens).toBeUndefined();
		expect(usageRecorder.calls[0]?.outputTokens).toBeUndefined();
		const done = events.find((event) => event.type === "done");
		expect(done).toMatchObject({ inputTokens: 20, outputTokens: 5 });
		expect(done && "totalInputTokens" in done && done.totalInputTokens).toBe(
			undefined,
		);
	});

	test("records a failed generate call with ok:false and rethrows", async () => {
		const { agent, usageRecorder } = setup({ failFinal: true });

		await expect(
			collect(agent.handleMessageStream(message())),
		).rejects.toThrow();

		expect(usageRecorder.calls).toHaveLength(1);
		expect(usageRecorder.calls[0]).toMatchObject({
			kind: "generate",
			ok: false,
		});
		expect(usageRecorder.calls[0]?.error).toBeString();
	});

	test("appends the exchange to the history store and replays it on the next call", async () => {
		const { agent, llm, historyStore } = setup();

		await collect(agent.handleMessageStream(message({ chunks: ["first"] })));
		expect(await historyStore.get("t1", 10)).toEqual([
			{ role: "user", content: "first" },
			{ role: "assistant", content: "Hi" },
		]);

		await collect(agent.handleMessageStream(message({ chunks: ["second"] })));
		const secondRequest = llm.requests.at(-1);
		expect(JSON.stringify(secondRequest?.messages)).toContain("first");
	});

	test("the history keeps the user's own text when one is given, the model still gets the chunks", async () => {
		const { agent, llm, historyStore } = setup();

		await collect(
			agent.handleMessageStream(
				message({
					chunks: ["what the model is told: one two"],
					historyText: "one\n\ntwo",
				}),
			),
		);

		expect(await historyStore.get("t1", 10)).toEqual([
			{ role: "user", content: "one\n\ntwo" },
			{ role: "assistant", content: "Hi" },
		]);
		expect(JSON.stringify(llm.requests.at(-1)?.messages)).toContain(
			"what the model is told",
		);
	});

	test("an empty historyText means the user's turn is stored already: not stored twice, not sent twice", async () => {
		const { agent, llm, historyStore } = setup();
		await historyStore.append({ threadId: "t1", userId: "u1" }, [
			{ role: "user", content: "one two" },
		]);

		await collect(
			agent.handleMessageStream(
				message({ chunks: ["wrapped: one two"], historyText: "" }),
			),
		);

		expect(await historyStore.get("t1", 10)).toEqual([
			{ role: "user", content: "one two" },
			{ role: "assistant", content: "Hi" },
		]);
		const sent = JSON.stringify(llm.requests.at(-1)?.messages);
		expect(sent).toContain("wrapped: one two");
		expect(sent.match(/one two/g)).toHaveLength(1);
	});

	test("with a history window of 0 the model sees only the current message, yet the exchange is still stored", async () => {
		const { agent, llm, historyStore } = setup({}, { maxHistoryMessages: 0 });

		await collect(agent.handleMessageStream(message({ chunks: ["first"] })));
		await collect(agent.handleMessageStream(message({ chunks: ["second"] })));

		const sent = (llm.requests.at(-1)?.messages ?? []) as { role: string }[];
		expect(sent.map((m) => m.role)).toEqual(["system", "user"]);
		expect(JSON.stringify(sent)).not.toContain("first");
		expect(await historyStore.get("t1", 10)).toHaveLength(4);
	});

	test("resetThread clears the thread in the history store", async () => {
		const { agent, historyStore } = setup();

		await collect(agent.handleMessageStream(message()));
		await agent.resetThread("t1");

		expect(await historyStore.get("t1", 10)).toEqual([]);
	});
});

describe("per-message system prompt", () => {
	const message: IncomingMessage = {
		threadId: "t",
		userId: "u",
		chunks: ["hello"],
	};

	test("replaces the agent's own system prompt for that message only", async () => {
		const { agent, llm } = setup({}, { maxHistoryMessages: 0 });
		await collect(
			agent.handleMessageStream({ ...message, systemPrompt: "channel prompt" }),
		);
		await collect(agent.handleMessageStream(message));
		const systems = llm.requests.map(
			(r) => (r.messages[0] as { role: string; content: string }).content,
		);
		expect(systems[0]).toBe("channel prompt");
		expect(systems[1]).not.toBe("channel prompt");
	});
});
