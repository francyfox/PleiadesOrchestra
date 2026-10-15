import { describe, expect, test } from "bun:test";
import { createLocalLaya, createServerLaya } from "./laya.ts";
import type { LayaEngine } from "./laya.types.ts";

const questions = {
	insured: {
		type: "boolean" as const,
		instructions: "Does the request ask for insurance?",
	},
	cabin: {
		type: "choice" as const,
		instructions: "Which cabin?",
		criteria: { economy: null, business: null },
	},
};

describe("createServerLaya", () => {
	test("decides over HTTP through the AI SDK: POST /v1/systemone, the key, boolean spelled noul", async () => {
		let seen: { path: string; auth: string | null; body: unknown } | undefined;
		const server = Bun.serve({
			port: 0,
			async fetch(request) {
				seen = {
					path: new URL(request.url).pathname,
					auth: request.headers.get("authorization"),
					body: await request.json(),
				};
				return Response.json({
					model: "laya",
					answers: {
						insured: { type: "noul", noul: 0.9 },
						cabin: {
							type: "choice",
							choice: "business",
							probabilities: { economy: 0.25, business: 0.75 },
						},
					},
					usage: { input_tokens: 5, output_tokens: 1 },
				});
			},
		});
		try {
			const laya = createServerLaya({
				baseUrl: `http://localhost:${server.port}`,
				apiKey: "k",
			});
			expect(laya.loadMs).toBe(0);
			const asked = await laya.ask("a flight with insurance", questions);
			expect(seen?.path).toBe("/v1/systemone");
			expect(seen?.auth).toBe("Bearer k");
			expect(seen?.body).toMatchObject({
				state: { message: "a flight with insurance" },
				questions: {
					insured: { type: "noul" },
					cabin: { type: "choice" },
				},
			});
			expect(asked.answers.insured).toEqual({
				type: "boolean",
				probability: 0.9,
			});
			expect(asked.answers.cabin).toMatchObject({
				type: "choice",
				choice: "business",
			});
			expect(asked.latencyMs).toBeGreaterThan(0);
			await laya.close();
		} finally {
			server.stop(true);
		}
	});
});

describe("createLocalLaya", () => {
	function engine() {
		const calls: unknown[] = [];
		let closed = false;
		const laya: LayaEngine = {
			async systemOne(state, asked) {
				calls.push({ state, asked });
				return {
					model: "laya",
					answers: {
						insured: { type: "noul", noul: 0.1 },
						cabin: {
							type: "choice",
							choice: "economy",
							probabilities: { economy: 0.75, business: 0.25 },
						},
					},
					usage: { input_tokens: 1, output_tokens: 1 },
				};
			},
			async close() {
				closed = true;
			},
		};
		return { laya, calls, closed: () => closed };
	}

	test("the same decide path as the server, on an engine in this process", async () => {
		const { laya: fake, calls, closed } = engine();
		const laya = createLocalLaya({ laya: fake, loadMs: 1234 });
		expect(laya.loadMs).toBe(1234);
		const asked = await laya.ask("economy, no insurance", questions);
		expect(calls).toEqual([
			{
				state: { message: "economy, no insurance" },
				asked: {
					insured: { ...questions.insured, type: "noul" },
					cabin: questions.cabin,
				},
			},
		]);
		expect(asked.answers.insured).toEqual({
			type: "boolean",
			probability: 0.1,
		});
		expect(asked.answers.cabin).toMatchObject({ choice: "economy" });
		await laya.close();
		expect(closed()).toBe(true);
	});

	test("a plain string is the state as it is (Snake's board)", async () => {
		const { laya: fake, calls } = engine();
		await createLocalLaya({ laya: fake, loadMs: 0 }).decide(
			"Safe route: yes.",
			questions,
		);
		expect((calls[0] as { state: unknown }).state).toBe("Safe route: yes.");
	});
});
