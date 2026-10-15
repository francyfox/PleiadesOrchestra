import { describe, expect, test } from "bun:test";
import { createTypeSafeAi } from "@ai-sdk/typesafe-ai";
import { createObservability } from "@repo/elysia-kit";
import { experimental_decide } from "ai";
import { type AppDeps, createApp as createServer } from "./app.ts";

const observability = createObservability("gamma-decision", {
	LOG_LEVEL: "silent",
});

const createApp = (deps: Omit<AppDeps, "observability">) =>
	createServer({ ...deps, observability });

const API_KEY = "test-api-key";

const LAYA_RESULT = {
	model: "laya-1",
	answers: { urgent: { type: "noul", noul: 0.42 } },
	usage: { input_tokens: 12, output_tokens: 1 },
};

function authedRequest(url: string, init: RequestInit = {}): Request {
	return new Request(url, {
		...init,
		headers: { ...init.headers, authorization: `Bearer ${API_KEY}` },
	});
}

describe("createApp", () => {
	test("GET /health responds ok without auth", async () => {
		const app = createApp({ decide: async () => ({}), apiKey: API_KEY });
		const response = await app.handle(new Request("http://localhost/health"));

		expect(response.status).toBe(200);
		expect(await response.text()).toBe("ok");
	});

	test("rejects requests without a valid bearer token", async () => {
		const app = createApp({ decide: async () => ({}), apiKey: API_KEY });
		const response = await app.handle(
			new Request("http://localhost/v1/systemone", { method: "POST" }),
		);

		expect(response.status).toBe(401);
	});

	test("POST /v1/systemone forwards state and questions to decide() and returns its result unchanged", async () => {
		let receivedState: unknown;
		let receivedQuestions: unknown;

		const app = createApp({
			apiKey: API_KEY,
			decide: async (state: unknown, questions: Record<string, unknown>) => {
				receivedState = state;
				receivedQuestions = questions;
				return LAYA_RESULT;
			},
		});

		const response = await app.handle(
			authedRequest("http://localhost/v1/systemone", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					state: { ticket: "refund request" },
					questions: {
						urgent: { type: "noul", instructions: "Is this urgent?" },
					},
				}),
			}),
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual(LAYA_RESULT);
		expect(receivedState).toEqual({ ticket: "refund request" });
		expect(receivedQuestions).toEqual({
			urgent: { type: "noul", instructions: "Is this urgent?" },
		});
	});

	test("POST /v1/systemone rejects unparseable JSON", async () => {
		const app = createApp({ decide: async () => ({}), apiKey: API_KEY });
		const response = await app.handle(
			authedRequest("http://localhost/v1/systemone", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: "not json",
			}),
		);

		expect(response.status).toBe(400);
	});

	test("is consumable by the AI SDK's TypeSafe decision model", async () => {
		const app = createApp({
			apiKey: API_KEY,
			decide: async () => ({
				model: "laya-1",
				answers: {
					size: {
						type: "choice",
						choice: "SUV",
						probabilities: { compact: 0.1, SUV: 0.9 },
					},
					urgent: { type: "noul", noul: 0.42 },
					level: {
						type: "score",
						score: 1,
						probabilities: { 0: 0.25, 1: 0.5, 2: 0.25 },
					},
				},
				usage: { input_tokens: 12, output_tokens: 3 },
			}),
		});
		const provider = createTypeSafeAi({
			baseURL: "http://localhost/v1",
			apiKey: API_KEY,
			fetch: Object.assign(
				(input: string | URL | Request, init?: RequestInit) =>
					app.handle(
						input instanceof Request
							? input
							: new Request(input.toString(), init),
					),
				{ preconnect: fetch.preconnect },
			),
		});

		const result = await experimental_decide({
			model: provider.decisionModel("laya"),
			state: { message: "an SUV please" },
			questions: {
				size: {
					type: "choice",
					instructions: "Which class?",
					criteria: { compact: null, SUV: null },
				},
				urgent: { type: "boolean", instructions: "Urgent?" },
				level: {
					type: "score",
					instructions: "How urgent?",
					criteria: ["low", "mid", "high"],
				},
			},
		});

		expect(result.answers.size.choice).toBe("SUV");
		expect(result.answers.urgent).toEqual({
			type: "boolean",
			probability: 0.42,
		});
		expect(result.answers.level.score).toBe(1);
		expect(result.usage.inputTokens).toBe(12);
	});

	test("unknown routes return 404", async () => {
		const app = createApp({ decide: async () => ({}), apiKey: API_KEY });
		const response = await app.handle(authedRequest("http://localhost/nope"));

		expect(response.status).toBe(404);
	});
});
