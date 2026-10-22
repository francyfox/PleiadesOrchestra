import { describe, expect, test } from "bun:test";
import {
	type AgentSpec,
	healthUrl,
	modelsUrl,
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

describe("modelsUrl", () => {
	test("the OpenAI-style model list under the configured base", () => {
		expect(modelsUrl("http://ollama:11434/v1/")).toBe(
			"http://ollama:11434/v1/models",
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

	test("a hosted decisions API (.../decisions, no /health) is up when the host answers with any status below 500, down on a network error or a 5xx", async () => {
		const hosted: AgentSpec = {
			...decision,
			baseUrl: "https://openrouter.ai/api/alpha/decisions",
		};
		const urls: string[] = [];
		const answerWith =
			(status: number | "network") => async (input: unknown) => {
				urls.push(String(input));
				if (status === "network") throw new Error("unreachable");
				return new Response("no", { status });
			};
		for (const [status, expected] of [
			[404, "up"],
			[405, "up"],
			[502, "down"],
			["network", "down"],
		] as const) {
			const [agent] = await probeAgents([hosted], {
				fetch: answerWith(status),
			});
			expect(agent?.status).toBe(expected);
		}
		expect(new Set(urls)).toEqual(
			new Set(["https://openrouter.ai/api/alpha/decisions"]),
		);
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

	test("an in-process agent is up or down by its own readiness, no HTTP", async () => {
		const translate = (ready: boolean): AgentSpec => ({
			id: "translate",
			name: "Opus-MT translator",
			role: "translate",
			baseUrl: "",
			model: "Helsinki-NLP/opus-mt-ru-en",
			ready,
		});
		const result = await probeAgents([translate(true), translate(false)], {
			fetch: async () => {
				throw new Error("no HTTP expected");
			},
		});
		expect(result.map((a) => a.status)).toEqual(["up", "down"]);
		expect(result[0]).toMatchObject({ role: "translate", endpoint: "" });
	});

	test("Ollama has no /health: a text or function-call agent is up when /v1/models answers", async () => {
		const ollama: AgentSpec = {
			id: "delta-function-call",
			name: "delta-function-call",
			role: "function-call",
			baseUrl: "http://192.168.100.39:11434/v1",
			model: "qwen3:1.7b-q8_0",
		};
		const time = clock();
		const urls: string[] = [];
		const [agent] = await probeAgents([ollama, text], {
			now: time.now,
			fetch: async (input) => {
				const url = String(input);
				urls.push(url);
				time.advance(10);
				return url.endsWith("/health")
					? new Response("not found", { status: 404 })
					: new Response("{}");
			},
		});
		expect(urls).toContain("http://192.168.100.39:11434/health");
		expect(urls).toContain("http://192.168.100.39:11434/v1/models");
		expect(agent?.status).toBe("up");
	});

	test("llama-server answering /health is not asked for /models", async () => {
		const urls: string[] = [];
		await probeAgents([text], {
			fetch: async (input) => {
				urls.push(String(input));
				return new Response("ok");
			},
		});
		expect(urls).toEqual(["http://beta-text:8080/health"]);
	});

	test("both endpoints down (404 and network error) → down, never throws", async () => {
		const [agent] = await probeAgents([text], {
			fetch: async (input) => {
				if (String(input).endsWith("/health")) {
					return new Response("no", { status: 404 });
				}
				throw new Error("ECONNREFUSED");
			},
		});
		expect(agent?.status).toBe("down");
		expect(agent?.latencyMs).toBeNull();
	});

	test("the decision agent is probed on /health only", async () => {
		const urls: string[] = [];
		const [agent] = await probeAgents([decision], {
			fetch: async (input) => {
				urls.push(String(input));
				return new Response("no", { status: 404 });
			},
		});
		expect(urls).toEqual(["http://gamma-decision:3001/health"]);
		expect(agent?.status).toBe("down");
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
