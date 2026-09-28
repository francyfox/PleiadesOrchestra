import { beforeEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { createObservability } from "@repo/elysia-kit";
import { type AdminApiDeps, createApp } from "../app.ts";
import { createAuth } from "../auth.ts";
import { openAdminDb } from "../db/index.ts";
import { createOrchestratorClient } from "../orchestrator/client.ts";

const MIGRATIONS = join(import.meta.dir, "../../drizzle");
const ORIGIN = "http://localhost:3002";

interface Upstream {
	method: string;
	url: string;
}

const json = (value: unknown) =>
	new Response(JSON.stringify(value), {
		headers: { "content-type": "application/json" },
	});

const CHANNEL = {
	id: "c1",
	slug: "site",
	name: "Site",
	kind: "web",
	accessMode: "open",
	allowedOrigins: [],
	publishableKey: "pk",
	disabledAt: null,
	createdAt: 1,
};
const BLOCK = {
	id: "b1",
	ipHash: "abc",
	ip: "203.0.113.7",
	channelId: null,
	reason: "spam",
	createdAt: 1,
	expiresAt: 2,
};
const AGENT = {
	id: "beta-text",
	name: "beta-text",
	role: "text",
	endpoint: "http://beta-text:8080/v1",
	model: "vikhr",
	status: "up",
	latencyMs: 12,
	checkedAt: 5,
};

let upstream: Upstream[];
let respond: (req: Upstream) => Response;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
	upstream = [];
	respond = () => json({});
	const db = openAdminDb(":memory:", MIGRATIONS);
	const deps: AdminApiDeps = {
		observability: createObservability("admin-api", { LOG_LEVEL: "silent" }),
		auth: createAuth({
			db,
			secret: "test-secret-test-secret-test-secret",
			baseURL: ORIGIN,
		}),
		db,
		orchestrator: createOrchestratorClient({
			baseUrl: "http://orchestrator",
			apiKey: "admin-key",
			fetch: (async (input: string | URL | Request, init?: RequestInit) => {
				const req = { method: init?.method ?? "GET", url: String(input) };
				upstream.push(req);
				return respond(req);
			}) as typeof fetch,
		}),
		trustedOrigins: [ORIGIN],
		systemSnapshot: async () => {
			throw new Error("not used");
		},
	};
	app = createApp(deps);
});

async function signedIn() {
	const response = await app.handle(
		new Request("http://localhost/api/auth/register", {
			method: "POST",
			headers: { "content-type": "application/json", origin: ORIGIN },
			body: JSON.stringify({
				email: "first@example.com",
				password: "correct-horse-battery",
				name: "First",
			}),
		}),
	);
	expect(response.status).toBe(200);
	return response.headers
		.getSetCookie()
		.map((value) => value.split(";")[0])
		.join("; ");
}

const get = (path: string, cookie: string) =>
	app.handle(new Request(`http://localhost${path}`, { headers: { cookie } }));

describe("paginated lists", () => {
	test("channels: page and pageSize go upstream, total comes back", async () => {
		const cookie = await signedIn();
		respond = () => json({ items: [CHANNEL], total: 7 });
		const response = await get("/api/channels?page=2&pageSize=5", cookie);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ items: [CHANNEL], total: 7 });
		expect(upstream[0]?.url).toBe(
			"http://orchestrator/v1/admin/channels?page=2&pageSize=5",
		);
	});

	test("channels without paging asks for everything", async () => {
		const cookie = await signedIn();
		respond = () => json({ items: [CHANNEL], total: 1 });
		await get("/api/channels", cookie);
		expect(upstream[0]?.url).toBe("http://orchestrator/v1/admin/channels");
	});

	test("blocked IPs: paging goes upstream and the plaintext ip is passed through", async () => {
		const cookie = await signedIn();
		respond = () => json({ items: [BLOCK], total: 11 });
		const response = await get("/api/blocked-ips?page=1&pageSize=10", cookie);
		expect(await response.json()).toEqual({ items: [BLOCK], total: 11 });
		expect(upstream[0]?.url).toBe(
			"http://orchestrator/v1/admin/blocked-ips?page=1&pageSize=10",
		);
	});

	test("pageSize above 100 is refused here, not forwarded", async () => {
		const cookie = await signedIn();
		const response = await get("/api/channels?pageSize=101", cookie);
		expect(response.status).toBe(422);
		expect(upstream).toHaveLength(0);
	});
});

describe("agents", () => {
	test("needs a session", async () => {
		const response = await app.handle(
			new Request("http://localhost/api/agents"),
		);
		expect(response.status).toBe(401);
	});

	test("passes the orchestrator's agent list through", async () => {
		const cookie = await signedIn();
		respond = () => json({ items: [AGENT] });
		const response = await get("/api/agents", cookie);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ items: [AGENT] });
		expect(upstream[0]?.url).toBe("http://orchestrator/v1/admin/agents");
	});

	test("an unreachable orchestrator is a 503 with a message, not a crash", async () => {
		const cookie = await signedIn();
		respond = () => {
			throw new Error("ECONNREFUSED");
		};
		const response = await get("/api/agents", cookie);
		expect(response.status).toBe(503);
	});
});
