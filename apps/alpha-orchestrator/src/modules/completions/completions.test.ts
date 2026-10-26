import { describe, expect, test } from "bun:test";
import type { EffectiveSettings } from "../agent-settings/agent-settings.types.ts";
import { completionsRoutes } from "./completions.ts";

const SETTINGS: EffectiveSettings = {
	baseUrl: "https://models.example/api/v1",
	apiKey: "sk-secret",
	model: "google/gemini-2.5-flash-lite",
	provider: "openrouter",
	reasoningEffort: "none",
	extraBody: { provider: { sort: "price" } },
};

function setup() {
	const sent: { url: string; init: RequestInit }[] = [];
	const app = completionsRoutes({
		settings: { effective: () => SETTINGS },
		agent: "beta-text",
		fetch: (async (url: string, init: RequestInit) => {
			sent.push({ url, init });
			return new Response('data: {"ok":true}\n\n', {
				status: 200,
				headers: { "content-type": "text/event-stream" },
			});
		}) as typeof fetch,
	});
	const post = (body: unknown) =>
		app.handle(
			new Request("http://localhost/v1/chat/completions", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(body),
			}),
		);
	return { sent, post };
}

describe("POST /v1/chat/completions", () => {
	test("forwards to beta's model: its model, key and request fields; the caller's fields kept", async () => {
		const { sent, post } = setup();
		const response = await post({
			model: "anything",
			messages: [{ role: "user", content: "hi" }],
			tools: [{ type: "function", function: { name: "get_cart" } }],
			stream: true,
		});

		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toBe("text/event-stream");
		expect(await response.text()).toBe('data: {"ok":true}\n\n');

		expect(sent[0]?.url).toBe("https://models.example/api/v1/chat/completions");
		const headers = new Headers(sent[0]?.init.headers);
		expect(headers.get("authorization")).toBe("Bearer sk-secret");
		expect(JSON.parse(String(sent[0]?.init.body))).toEqual({
			provider: { sort: "price" },
			reasoning_effort: "none",
			messages: [{ role: "user", content: "hi" }],
			tools: [{ type: "function", function: { name: "get_cart" } }],
			stream: true,
			model: "google/gemini-2.5-flash-lite",
		});
	});

	test("the upstream's error status and body reach the caller", async () => {
		const app = completionsRoutes({
			settings: { effective: () => SETTINGS },
			agent: "beta-text",
			fetch: (async () =>
				new Response('{"error":"rate"}', {
					status: 429,
				})) as unknown as typeof fetch,
		});
		const response = await app.handle(
			new Request("http://localhost/v1/chat/completions", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ messages: [] }),
			}),
		);
		expect(response.status).toBe(429);
		expect(await response.text()).toBe('{"error":"rate"}');
	});
});
