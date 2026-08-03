import { describe, expect, test } from "bun:test";

const BASE_URL =
	process.env.ALBEDO_URL ?? "https://albedo-production.up.railway.app";
const API_KEY = process.env.LLM_API_KEY;

describe("albedo (prod)", () => {
	test("/health responds 200", async () => {
		const res = await fetch(`${BASE_URL}/health`);
		expect(res.status).toBe(200);
	});

	test("rejects chat completion without api key", async () => {
		const res = await fetch(`${BASE_URL}/v1/chat/completions`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
		});
		expect(res.status).toBe(401);
	});

	test("chat completion works with api key", async () => {
		if (!API_KEY)
			throw new Error("Set LLM_API_KEY in the environment to run this test");

		const res = await fetch(`${BASE_URL}/v1/chat/completions`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${API_KEY}`,
			},
			body: JSON.stringify({
				messages: [{ role: "user", content: "Say one word: OK" }],
				max_tokens: 10,
			}),
		});

		expect(res.status).toBe(200);
		const json = await res.json();
		expect(json.choices?.[0]?.message?.content).toBeTruthy();
	}, 45_000);
});
