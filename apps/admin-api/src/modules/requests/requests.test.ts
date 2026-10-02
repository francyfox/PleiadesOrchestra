import { describe, expect, test } from "bun:test";
import {
	call,
	json,
	setRespond,
	signedIn,
	upstream,
	useHarness,
} from "../../app.harness.testing.ts";

useHarness();

const DETAILS = {
	request: {
		id: "r1",
		userId: "u",
		threadId: "t",
		prompt: "привет",
		intent: null,
		status: "succeeded",
		goal: { replied: true },
		reply: "Здравствуйте",
		startedAt: 1000,
		durationMs: 900,
	},
	runs: [
		{
			id: "r1",
			createdAt: 1000,
			durationMs: 900,
			succeeded: true,
			running: false,
			events: [
				{
					seq: 0,
					type: "planned",
					attempt: 0,
					action: null,
					payload: {
						plan: [{ name: "generateReply", cost: 5 }],
						totalCost: 5,
						state: {},
					},
					at: 1100,
				},
				{
					seq: 1,
					type: "action_started",
					attempt: 0,
					action: "generateReply",
					payload: {},
					at: 1110,
				},
				{
					seq: 2,
					type: "action_finished",
					attempt: 0,
					action: "generateReply",
					payload: {
						durationMs: 700,
						expectedEffects: { replied: true },
						observedEffects: { replied: true },
					},
					at: 1810,
				},
			],
		},
	],
	llmCalls: [],
	now: 5000,
};

describe("requests (proxied and shaped)", () => {
	test("the list is the orchestrator's page as is", async () => {
		const cookie = await signedIn();
		const page = {
			items: [
				{
					id: "r1",
					userId: "u",
					threadId: "t",
					prompt: "привет",
					intent: null,
					status: "succeeded",
					steps: ["generateReply"],
					runs: 1,
					startedAt: 1,
					durationMs: 2,
				},
			],
			total: 1,
		};
		setRespond(() => json(page));

		const response = await call("/api/requests?page=2&pageSize=10", { cookie });

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual(page);
		expect(upstream[0]?.url).toContain("/v1/admin/requests?page=2&pageSize=10");
	});

	test("one request comes back already shaped for drawing", async () => {
		const cookie = await signedIn();
		setRespond(() => json(DETAILS));

		const response = await call("/api/requests/r1", { cookie });

		expect(response.status).toBe(200);
		const view = (await response.json()) as {
			nodes: { kind: string; label: string; status: string }[];
		};
		expect(view.nodes.map((n) => [n.kind, n.label, n.status])).toEqual([
			["prompt", "привет", "done"],
			["understand", "", "done"],
			["action", "generateReply", "done"],
			["result", "Здравствуйте", "reached"],
		]);
		expect(upstream[0]?.url).toContain("/v1/admin/requests/r1");
	});

	test("an unknown request is 404 and needs a session", async () => {
		const cookie = await signedIn();
		setRespond(() => new Response("Not found", { status: 404 }));
		expect((await call("/api/requests/nope", { cookie })).status).toBe(404);
		expect((await call("/api/requests")).status).toBe(401);
	});
});
