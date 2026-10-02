import { describe, expect, test } from "bun:test";
import { createOrchestratorClient } from "./orchestrator.ts";

interface Recorded {
	method: string;
	url: string;
	headers: Headers;
	body: unknown;
}

function fakeFetch(respond: (req: Recorded) => Response) {
	const calls: Recorded[] = [];
	const fetchFn = async (input: string | URL | Request, init?: RequestInit) => {
		const req: Recorded = {
			method: init?.method ?? "GET",
			url: String(input),
			headers: new Headers(init?.headers),
			body: init?.body ? JSON.parse(String(init.body)) : undefined,
		};
		calls.push(req);
		return respond(req);
	};
	return { calls, fetch: fetchFn as typeof fetch };
}

const json = (value: unknown, status = 200) =>
	new Response(JSON.stringify(value), {
		status,
		headers: { "content-type": "application/json" },
	});

describe("createOrchestratorClient", () => {
	test("sends the admin bearer key on reads, without X-Admin-Id", async () => {
		const f = fakeFetch(() => json({ items: [], nextCursor: null, total: 0 }));
		const client = createOrchestratorClient({
			baseUrl: "http://orch:3000/",
			apiKey: "secret",
			fetch: f.fetch,
		});

		await client.listUsers({ status: "pending", q: "", limit: 20 });

		const call = f.calls[0];
		expect(call?.method).toBe("GET");
		expect(call?.url).toBe(
			"http://orch:3000/v1/admin/users?status=pending&limit=20",
		);
		expect(call?.headers.get("authorization")).toBe("Bearer secret");
		expect(call?.headers.has("x-admin-id")).toBe(false);
	});

	test("mutations carry X-Admin-Id and a JSON body", async () => {
		const f = fakeFetch(() => json({ user: { id: "u1" } }));
		const client = createOrchestratorClient({
			baseUrl: "http://orch:3000",
			apiKey: "secret",
			fetch: f.fetch,
		}).as("admin-7");

		await client.blockUser("u/1", "spam");

		const call = f.calls[0];
		expect(call?.method).toBe("POST");
		expect(call?.url).toBe("http://orch:3000/v1/admin/users/u%2F1/block");
		expect(call?.headers.get("x-admin-id")).toBe("admin-7");
		expect(call?.headers.get("content-type")).toBe("application/json");
		expect(call?.body).toEqual({ reason: "spam" });
	});

	test("bulk action posts ids, action and optional reason", async () => {
		const f = fakeFetch(() => json({ updated: 2 }));
		const client = createOrchestratorClient({
			baseUrl: "http://orch:3000",
			apiKey: "k",
			fetch: f.fetch,
		}).as("a1");

		const result = await client.bulkUsers(["a", "b"], "whitelist");

		expect(result).toEqual({ updated: 2 });
		expect(f.calls[0]?.body).toEqual({ ids: ["a", "b"], action: "whitelist" });
	});

	test("204 responses resolve to undefined", async () => {
		const f = fakeFetch(() => new Response(null, { status: 204 }));
		const client = createOrchestratorClient({
			baseUrl: "http://orch:3000",
			apiKey: "k",
			fetch: f.fetch,
		}).as("a1");

		await expect(client.deleteUserMessages("u1")).resolves.toBeUndefined();
		expect(f.calls[0]?.method).toBe("DELETE");
	});

	test("non-2xx responses throw an OrchestratorError carrying the status", async () => {
		const f = fakeFetch(() => new Response("nope", { status: 404 }));
		const client = createOrchestratorClient({
			baseUrl: "http://orch:3000",
			apiKey: "k",
			fetch: f.fetch,
		});

		const error = await client.getUser("missing").catch((e: unknown) => e);
		expect(error).toMatchObject({ name: "OrchestratorError", status: 404 });
	});

	test("an unreachable orchestrator becomes a 503 OrchestratorError", async () => {
		const client = createOrchestratorClient({
			baseUrl: "http://orch:3000",
			apiKey: "k",
			fetch: (async () => {
				throw new TypeError("Unable to connect");
			}) as unknown as typeof fetch,
		});

		const error = await client.stats().catch((e: unknown) => e);
		expect(error).toMatchObject({ name: "OrchestratorError", status: 503 });
	});

	test("usage query forwards groupBy and period", async () => {
		const f = fakeFetch(() => json({ rows: [] }));
		const client = createOrchestratorClient({
			baseUrl: "http://orch:3000",
			apiKey: "k",
			fetch: f.fetch,
		});

		await client.usage({ groupBy: "day", from: 1, to: 2 });

		expect(f.calls[0]?.url).toBe(
			"http://orch:3000/v1/admin/usage?groupBy=day&from=1&to=2",
		);
	});
});
