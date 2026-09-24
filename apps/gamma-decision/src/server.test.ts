import { describe, expect, test } from "bun:test";
import { createApp } from "./server.ts";

const API_KEY = "test-api-key";

function authedRequest(url: string, init: RequestInit = {}): Request {
	return new Request(url, {
		...init,
		headers: { ...init.headers, authorization: `Bearer ${API_KEY}` },
	});
}

describe("createApp", () => {
	test("GET /health responds ok without auth", async () => {
		const app = createApp({ decide: async () => ({}), apiKey: API_KEY });
		const response = await app.handle(
			new Request("http://laya-api.local/health"),
		);

		expect(response.status).toBe(200);
		expect(await response.text()).toBe("ok");
	});

	test("rejects requests without a valid bearer token", async () => {
		const app = createApp({ decide: async () => ({}), apiKey: API_KEY });
		const response = await app.handle(
			new Request("http://laya-api.local/v1/decide", { method: "POST" }),
		);

		expect(response.status).toBe(401);
	});

	test("POST /v1/decide forwards state and questions to decide() and returns its answers", async () => {
		let receivedState: unknown;
		let receivedQuestions: unknown;

		const app = createApp({
			apiKey: API_KEY,
			decide: async (state: unknown, questions: Record<string, unknown>) => {
				receivedState = state;
				receivedQuestions = questions;
				return { urgent: { type: "noul", noul: 0.42 } };
			},
		});

		const response = await app.handle(
			authedRequest("http://laya-api.local/v1/decide", {
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
		expect(await response.json()).toEqual({
			answers: { urgent: { type: "noul", noul: 0.42 } },
		});
		expect(receivedState).toEqual({ ticket: "refund request" });
		expect(receivedQuestions).toEqual({
			urgent: { type: "noul", instructions: "Is this urgent?" },
		});
	});

	test("POST /v1/decide rejects unparseable JSON", async () => {
		const app = createApp({ decide: async () => ({}), apiKey: API_KEY });
		const response = await app.handle(
			authedRequest("http://laya-api.local/v1/decide", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: "not json",
			}),
		);

		expect(response.status).toBe(400);
	});

	test("unknown routes return 404", async () => {
		const app = createApp({ decide: async () => ({}), apiKey: API_KEY });
		const response = await app.handle(
			authedRequest("http://laya-api.local/nope"),
		);

		expect(response.status).toBe(404);
	});
});
