import { describe, expect, test } from "bun:test";
import {
	CHOICE_MAX_TOKENS,
	createDelta,
	FIELD_MAX_TOKENS,
	parseAnswer,
} from "./delta.ts";
import type { Case } from "./delta.types.ts";

describe("parseAnswer", () => {
	test("the JSON object in the answer's text", () => {
		expect(parseAnswer('{"query":"tent"}')).toEqual({ query: "tent" });
	});

	test("unparseable or empty text is undefined", () => {
		expect(parseAnswer("Sure! here")).toBeUndefined();
		expect(parseAnswer("")).toBeUndefined();
	});
});

const booking: Case = {
	tool: {
		name: "t",
		description: "",
		inputSchema: {
			type: "object",
			properties: { city: { type: "string" }, note: { type: "string" } },
			required: ["city"],
		},
	},
	facts: {},
	request: "r",
};

interface Seen {
	schema: string;
	max: number;
	headers: Headers;
	body: Record<string, unknown>;
}

/** An OpenAI-compatible server that answers every field with "x" and records what it was sent. */
function fakeServer() {
	const seen: Seen[] = [];
	const server = Bun.serve({
		port: 0,
		async fetch(request) {
			const body = (await request.json()) as Record<string, unknown> & {
				max_tokens: number;
				response_format: { json_schema: { schema: { properties: object } } };
			};
			const fields = Object.keys(
				body.response_format.json_schema.schema.properties,
			);
			seen.push({
				schema: fields.join(","),
				max: body.max_tokens,
				headers: request.headers,
				body,
			});
			const content =
				fields[0] === "fill"
					? '{"fill":["note"]}'
					: JSON.stringify({ [fields[0] as string]: "x" });
			return Response.json({
				choices: [{ message: { content }, finish_reason: "stop" }],
				usage: { prompt_tokens: 10, completion_tokens: 3 },
			});
		},
	});
	return { seen, server, baseUrl: `http://localhost:${server.port}` };
}

describe("createDelta", () => {
	test("short answers: a small token budget for the choice, a bigger one per field", async () => {
		const { seen, server, baseUrl } = fakeServer();
		try {
			const filled = await createDelta({ endpoint: { baseUrl } }).fillByField(
				booking,
			);
			expect(filled.args).toEqual({ city: "x", note: "x" });
			expect(filled.calls).toBe(3);
			expect(filled.promptTokens).toBe(30);
			expect(filled.outputTokens).toBe(9);
			expect(seen.map(({ schema, max }) => ({ schema, max }))).toEqual([
				{ schema: "fill", max: CHOICE_MAX_TOKENS },
				{ schema: "city", max: FIELD_MAX_TOKENS },
				{ schema: "note", max: FIELD_MAX_TOKENS },
			]);
			expect(CHOICE_MAX_TOKENS).toBe(48);
			expect(FIELD_MAX_TOKENS).toBe(128);
		} finally {
			server.stop(true);
		}
	});

	test("a named model (Ollama) is sent with reasoning_effort none; llama-server gets neither the effort nor a key", async () => {
		const ollama = fakeServer();
		const llama = fakeServer();
		try {
			await createDelta({
				endpoint: {
					baseUrl: ollama.baseUrl,
					model: "qwen3:1.7b-q8_0",
					apiKey: "k",
				},
			}).fillByField(booking);
			for (const { body, headers } of ollama.seen) {
				expect(body.model).toBe("qwen3:1.7b-q8_0");
				expect(body.reasoning_effort).toBe("none");
				expect(body.chat_template_kwargs).toEqual({ enable_thinking: false });
				expect(body.temperature).toBe(0);
				expect(headers.get("authorization")).toBe("Bearer k");
			}

			await createDelta({ endpoint: { baseUrl: llama.baseUrl } }).fillByField(
				booking,
			);
			for (const { body, headers } of llama.seen) {
				expect(body.reasoning_effort).toBeUndefined();
				expect(body.chat_template_kwargs).toEqual({ enable_thinking: false });
				expect(headers.get("authorization")).toBeNull();
			}
		} finally {
			ollama.server.stop(true);
			llama.server.stop(true);
		}
	});

	test("prefilled and skipped fields are neither asked for nor filled again", async () => {
		const { seen, server, baseUrl } = fakeServer();
		try {
			const filled = await createDelta({ endpoint: { baseUrl } }).fillByField(
				booking,
				{ prefilled: { city: "Rome" }, skip: ["note"] },
			);
			expect(filled.args).toEqual({ city: "Rome" });
			expect(seen).toEqual([]);
			expect(filled.calls).toBe(0);
		} finally {
			server.stop(true);
		}
	});

	test("an unusable answer leaves the field out", async () => {
		const server = Bun.serve({
			port: 0,
			fetch: () =>
				Response.json({
					choices: [{ message: { content: "Sure! here" } }],
				}),
		});
		try {
			const filled = await createDelta({
				endpoint: { baseUrl: `http://localhost:${server.port}` },
			}).fillByField(booking);
			expect(filled.args).toEqual({});
		} finally {
			server.stop(true);
		}
	});
});
