import { describe, expect, test } from "bun:test";
import {
	type AgentSpec,
	healthUrl,
	probeAgents,
	productRequestPrompt,
	publicEndpoint,
} from "./agents.service.ts";

const text: AgentSpec = {
	id: "beta-text",
	name: "beta-text",
	role: "text",
	baseUrl: "http://beta-text:8080/v1",
	model: "vikhr",
};
const decision: AgentSpec = {
	id: "gamma-decision",
	name: "gamma-decision",
	role: "decision",
	baseUrl: "http://gamma-decision:3001",
	model: null,
};

function clock() {
	let now = 1_000;
	return {
		now: () => now,
		advance: (ms: number) => {
			now += ms;
		},
	};
}

describe("healthUrl", () => {
	test("llama-server serves /health at the root, not under /v1", () => {
		expect(healthUrl("http://beta-text:8080/v1")).toBe(
			"http://beta-text:8080/health",
		);
		expect(healthUrl("http://beta-text:8080/v1/")).toBe(
			"http://beta-text:8080/health",
		);
		expect(healthUrl("http://gamma-decision:3001")).toBe(
			"http://gamma-decision:3001/health",
		);
	});
});

describe("publicEndpoint", () => {
	test("drops credentials, query and fragment", () => {
		expect(
			publicEndpoint("http://user:secret@host:8080/v1/?api_key=abc#x"),
		).toBe("http://host:8080/v1");
	});

	test("a value that is not a URL is not echoed back", () => {
		expect(publicEndpoint("not a url")).toBe("");
	});
});

describe("probeAgents", () => {
	test("up when /health answers 2xx, with the measured latency", async () => {
		const time = clock();
		const urls: string[] = [];
		const [agent] = await probeAgents([text], {
			now: time.now,
			fetch: async (input) => {
				urls.push(String(input));
				time.advance(42);
				return new Response("ok");
			},
		});
		expect(urls).toEqual(["http://beta-text:8080/health"]);
		expect(agent).toEqual({
			id: "beta-text",
			name: "beta-text",
			role: "text",
			endpoint: "http://beta-text:8080/v1",
			model: "vikhr",
			status: "up",
			latencyMs: 42,
			checkedAt: 1_042,
		});
	});

	test("down on a non-2xx answer or a network error, never throws, no latency", async () => {
		const time = clock();
		const result = await probeAgents([text, decision], {
			now: time.now,
			fetch: async (input) => {
				if (String(input).includes("beta-text")) {
					return new Response("loading", { status: 503 });
				}
				throw new Error("ECONNREFUSED");
			},
		});
		expect(result.map((agent) => agent.status)).toEqual(["down", "down"]);
		expect(result.map((agent) => agent.latencyMs)).toEqual([null, null]);
	});

	test("probes run in parallel and keep the input order", async () => {
		let inFlight = 0;
		let maxInFlight = 0;
		const result = await probeAgents([text, decision], {
			fetch: async () => {
				inFlight++;
				maxInFlight = Math.max(maxInFlight, inFlight);
				await Bun.sleep(10);
				inFlight--;
				return new Response("ok");
			},
		});
		expect(maxInFlight).toBe(2);
		expect(result.map((agent) => agent.id)).toEqual([
			"beta-text",
			"gamma-decision",
		]);
	});

	test("a hanging agent is cut off by the timeout", async () => {
		const [agent] = await probeAgents([text], {
			timeoutMs: 20,
			fetch: (_input, init) =>
				new Promise((_resolve, reject) => {
					init?.signal?.addEventListener("abort", () =>
						reject(new Error("aborted")),
					);
				}),
		});
		expect(agent?.status).toBe("down");
	});

	test("no agents configured → empty list", async () => {
		expect(await probeAgents([], {})).toEqual([]);
	});
});

describe("productRequestPrompt", () => {
	test("asks for JSON only", () => {
		const prompt = productRequestPrompt();
		expect(prompt).toContain("по-английски");
		expect(prompt).toContain('"query"');
		expect(prompt).toContain('"quantity"');
	});
});
