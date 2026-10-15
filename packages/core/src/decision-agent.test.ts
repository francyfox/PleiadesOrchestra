import { describe, expect, test } from "bun:test";
import { Experimental_DecisionMockModelV4 } from "ai/test";
import type { ConsolaReporter, LogObject } from "consola";
import { createDecisionAgent } from "./decision-agent.ts";
import { createTelemetry } from "./telemetry.ts";

const BASE_URL = "https://laya-api.internal";
const API_KEY = "test-api-key";

function fakeFetch(
	handler: (input: string | URL | Request, init?: RequestInit) => Response,
): typeof fetch {
	return (async (input: string | URL | Request, init?: RequestInit) =>
		handler(input, init)) as typeof fetch;
}

const urgentQuestion = {
	urgent: { type: "boolean", instructions: "Is this urgent?" },
} as const;

describe("createDecisionAgent", () => {
	test("by default decide posts to /v1/systemone with a bearer token and returns SDK-shaped answers", async () => {
		let capturedUrl: string | undefined;
		let capturedInit: RequestInit | undefined;

		const agent = createDecisionAgent({
			baseURL: BASE_URL,
			apiKey: API_KEY,
			fetchImpl: fakeFetch((input, init) => {
				capturedUrl = String(input);
				capturedInit = init;
				return new Response(
					JSON.stringify({
						model: "laya-1",
						answers: { urgent: { type: "noul", noul: 0.87 } },
						usage: { input_tokens: 4, output_tokens: 1 },
					}),
					{ headers: { "content-type": "application/json" } },
				);
			}),
		});

		const answers = await agent.decide(
			{ ticket: "refund request" },
			urgentQuestion,
		);

		expect(answers).toEqual({ urgent: { type: "boolean", probability: 0.87 } });
		expect(capturedUrl).toBe(`${BASE_URL}/v1/systemone`);
		expect(capturedInit?.method).toBe("POST");
		expect(new Headers(capturedInit?.headers).get("authorization")).toBe(
			`Bearer ${API_KEY}`,
		);
		expect(JSON.parse(String(capturedInit?.body))).toMatchObject({
			model: "laya",
			questions: {
				urgent: { type: "noul", instructions: "Is this urgent?" },
			},
		});
	});

	test("an injected decision model replaces the HTTP one", async () => {
		const agent = createDecisionAgent({
			baseURL: BASE_URL,
			apiKey: API_KEY,
			model: new Experimental_DecisionMockModelV4({
				doDecide: async () => ({
					answers: { urgent: { type: "boolean", probability: 0.1 } },
					warnings: [],
				}),
			}),
		});

		expect(await agent.decide({ a: 1 }, urgentQuestion)).toEqual({
			urgent: { type: "boolean", probability: 0.1 },
		});
	});

	test("decide throws on a non-ok response", async () => {
		const agent = createDecisionAgent({
			baseURL: BASE_URL,
			apiKey: API_KEY,
			fetchImpl: fakeFetch(
				() => new Response("boom", { status: 500, statusText: "Server Error" }),
			),
		});

		await expect(agent.decide({}, urgentQuestion)).rejects.toThrow(
			/Server Error/,
		);
	});

	// Same telemetry contract as `createAgent`'s `logLlmState` calls — both are
	// "agent" ports and should be equally observable, not just structurally
	// similar factories with no shared behavior.
	test("decide logs telemetry via logLlmState on success", async () => {
		const logs: LogObject[] = [];
		const reporter: ConsolaReporter = { log: (logObj) => logs.push(logObj) };

		const agent = createDecisionAgent({
			baseURL: BASE_URL,
			apiKey: API_KEY,
			telemetry: createTelemetry([reporter]),
			model: new Experimental_DecisionMockModelV4({
				doDecide: async () => ({
					answers: { urgent: { type: "boolean", probability: 0.5 } },
					warnings: [],
				}),
			}),
		});

		await agent.decide({}, urgentQuestion);

		expect(logs.length).toBe(1);
		expect(logs[0]?.["gen_ai.provider.name"]).toBe("laya");
		expect(logs[0]?.ok).toBe(true);
	});

	test("decide logs telemetry via logLlmState on failure, still throws", async () => {
		const logs: LogObject[] = [];
		const reporter: ConsolaReporter = { log: (logObj) => logs.push(logObj) };

		const agent = createDecisionAgent({
			baseURL: BASE_URL,
			apiKey: API_KEY,
			telemetry: createTelemetry([reporter]),
			fetchImpl: fakeFetch(
				() => new Response("boom", { status: 500, statusText: "Server Error" }),
			),
		});

		await expect(agent.decide({}, urgentQuestion)).rejects.toThrow(
			/Server Error/,
		);

		expect(logs.length).toBe(1);
		expect(logs[0]?.ok).toBe(false);
	});
});
