import { describe, expect, test } from "bun:test";
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

describe("createDecisionAgent", () => {
	test("decide posts to /v1/decide with a bearer token and returns parsed answers", async () => {
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
						answers: {
							urgent: {
								type: "noul",
								noul: 0.87,
								rl_agent: { act_probability: 0.99 },
							},
						},
					}),
					{ headers: { "content-type": "application/json" } },
				);
			}),
		});

		const answers = await agent.decide(
			{ ticket: "refund request" },
			{
				urgent: { type: "noul", instructions: "Is this urgent?" },
			},
		);

		expect(answers).toEqual({
			urgent: {
				type: "noul",
				noul: 0.87,
				rl_agent: { act_probability: 0.99 },
			},
		});
		expect(capturedUrl).toBe(`${BASE_URL}/v1/decide`);
		expect(capturedInit?.method).toBe("POST");
		expect(new Headers(capturedInit?.headers).get("authorization")).toBe(
			`Bearer ${API_KEY}`,
		);
		expect(JSON.parse(String(capturedInit?.body))).toEqual({
			state: { ticket: "refund request" },
			questions: {
				urgent: { type: "noul", instructions: "Is this urgent?" },
			},
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

		await expect(agent.decide({}, {})).rejects.toThrow(/500/);
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
			fetchImpl: fakeFetch(
				() =>
					new Response(JSON.stringify({ answers: {} }), {
						headers: { "content-type": "application/json" },
					}),
			),
		});

		await agent.decide({}, {});

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

		await expect(agent.decide({}, {})).rejects.toThrow(/500/);

		expect(logs.length).toBe(1);
		expect(logs[0]?.ok).toBe(false);
	});
});
