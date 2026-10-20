import { describe, expect, test } from "bun:test";
import {
	call,
	json,
	setRespond,
	signedIn,
	upstream,
	useHarness,
} from "../../app.harness.testing.ts";

// parsed JSON, shape asserted by the tests
type Turn = ReturnType<typeof JSON.parse>;

useHarness();

const DETAILS = {
	request: {
		id: "r1",
		visitorId: "u",
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
					visitorId: "u",
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

	test("the status and intent filters reach the orchestrator; an unknown status is refused", async () => {
		const cookie = await signedIn();
		setRespond(() => json({ items: [], total: 0 }));

		const ok = await call("/api/requests?status=failed&intent=search", {
			cookie,
		});
		expect(ok.status).toBe(200);
		expect(upstream[0]?.url).toContain("status=failed");
		expect(upstream[0]?.url).toContain("intent=search");

		const bad = await call("/api/requests?status=nope", { cookie });
		expect(bad.status).toBe(422);
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

	test("the trace carries the channel's tools and the browser's answer", async () => {
		const cookie = await signedIn();
		const withTool: typeof DETAILS = structuredClone(DETAILS);
		const events: unknown[] = withTool.runs[0]?.events ?? [];
		events.push({
			seq: 3,
			type: "waiting",
			attempt: 0,
			action: "find_laptops",
			payload: {
				waiting: {
					kind: "webmcp_tool_call",
					payload: { tool: "find_laptops", arguments: { maxPrice: 900 } },
				},
				state: { channelId: "c1" },
			},
			at: 1900,
		});
		setRespond((req) =>
			req.url.includes("/v1/admin/mcp")
				? json({
						items: [
							{
								channelId: "c1",
								channelSlug: "s",
								channelName: "n",
								toolCount: 1,
								firstSeenAt: 0,
								lastSeenAt: 0,
								registrations: 1,
								versions: 1,
								tools: [{ name: "find_laptops", description: "Find laptops" }],
							},
						],
					})
				: json(withTool),
		);

		const response = await call("/api/requests/r1/trace", { cookie });

		expect(response.status).toBe(200);
		const trace = (await response.json()) as Turn[];
		expect(
			trace[0].userPrompt.config.tools[0].functionDeclarations[0].name,
		).toBe("_0_find_laptops");
		expect(
			trace[1].response.candidates[0].content.parts[0].functionCall.args,
		).toEqual({
			maxPrice: 900,
		});
		expect((await call("/api/requests/r1/trace")).status).toBe(401);
	});

	test("an unknown request is 404 and needs a session", async () => {
		const cookie = await signedIn();
		setRespond(() => new Response("Not found", { status: 404 }));
		expect((await call("/api/requests/nope", { cookie })).status).toBe(404);
		expect((await call("/api/requests")).status).toBe(401);
	});
});
