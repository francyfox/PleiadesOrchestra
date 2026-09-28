import { beforeEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { createObservability } from "@repo/elysia-kit";
import { type AdminApiDeps, createApp } from "./app.ts";
import { createAuth } from "./auth.ts";
import { openAdminDb } from "./db/index.ts";
import { createOrchestratorClient } from "./orchestrator/client.ts";
import type { SystemSnapshot } from "./schemas/system.ts";

const MIGRATIONS = join(import.meta.dir, "../drizzle");
const ORIGIN = "http://localhost:3002";
const PASSWORD = "correct-horse-battery";

interface Upstream {
	method: string;
	url: string;
	headers: Headers;
	body: unknown;
}

const json = (value: unknown, status = 200) =>
	new Response(JSON.stringify(value), {
		status,
		headers: { "content-type": "application/json" },
	});

const SNAPSHOT: SystemSnapshot = {
	cpu: {
		model: "Test CPU",
		logicalCores: 4,
		physicalCores: 2,
		features: {
			avx2: true,
			fma: true,
			f16c: true,
			avx512: false,
			avxVnni: false,
		},
	},
	cpuBusyPercent: 12,
	memory: { totalBytes: 8, availableBytes: 4 },
	gpus: [],
	at: 1,
};

const USAGE = {
	inputTokens: 1,
	outputTokens: 2,
	calls: 1,
	callsWithoutUsage: 0,
};
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
const USER = {
	id: "u1",
	channel: { id: "c1", slug: "site", name: "Site", kind: "web" },
	kind: "identified",
	externalUserId: "42",
	displayName: "Ann",
	status: "allowed",
	whitelistedAt: null,
	whitelistedBy: null,
	blockedAt: null,
	blockedReason: null,
	blockedBy: null,
	createdAt: 1,
	lastSeenAt: 2,
	ip: null,
	usage: USAGE,
};

let upstream: Upstream[];
let respond: (req: Upstream) => Response;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
	upstream = [];
	respond = () => json({});
	const db = openAdminDb(":memory:", MIGRATIONS);
	const auth = createAuth({
		db,
		secret: "test-secret-test-secret-test-secret",
		baseURL: ORIGIN,
	});
	const deps: AdminApiDeps = {
		observability: createObservability("admin-api", { LOG_LEVEL: "silent" }),
		auth,
		db,
		orchestrator: createOrchestratorClient({
			baseUrl: "http://orchestrator",
			apiKey: "admin-key",
			fetch: (async (input: string | URL | Request, init?: RequestInit) => {
				const req: Upstream = {
					method: init?.method ?? "GET",
					url: String(input),
					headers: new Headers(init?.headers),
					body: init?.body ? JSON.parse(String(init.body)) : undefined,
				};
				upstream.push(req);
				return respond(req);
			}) as typeof fetch,
		}),
		trustedOrigins: [ORIGIN],
		systemSnapshot: async () => SNAPSHOT,
	};
	app = createApp(deps);
});

// biome-ignore lint/suspicious/noExplicitAny: response bodies are inspected loosely in tests
type Json = any;
type TestResponse = Omit<Response, "json"> & { json(): Promise<Json> };

function call(
	path: string,
	init: {
		method?: string;
		body?: unknown;
		cookie?: string;
		origin?: string | null;
	} = {},
): Promise<TestResponse> {
	const headers: Record<string, string> = {};
	if (init.body !== undefined) headers["content-type"] = "application/json";
	if (init.cookie) headers.cookie = init.cookie;
	if (init.origin !== null) headers.origin = init.origin ?? ORIGIN;
	return app.handle(
		new Request(`http://localhost${path}`, {
			method: init.method ?? "GET",
			headers,
			body: init.body === undefined ? undefined : JSON.stringify(init.body),
		}),
	);
}

const cookieOf = (response: Response) =>
	response.headers
		.getSetCookie()
		.map((value) => value.split(";")[0])
		.join("; ");

async function signedIn(email = "first@example.com") {
	const response = await call("/api/auth/register", {
		method: "POST",
		body: { email, password: PASSWORD, name: "First" },
	});
	expect(response.status).toBe(200);
	return cookieOf(response);
}

describe("session and auth", () => {
	test("a fresh install asks for setup and has no admin", async () => {
		const response = await call("/api/session");
		expect(await response.json()).toEqual({ setupRequired: true, admin: null });
	});

	test("register creates the first admin, signs them in and closes setup", async () => {
		const cookie = await signedIn();
		const session = await (await call("/api/session", { cookie })).json();
		expect(session.setupRequired).toBe(false);
		expect(session.admin).toMatchObject({
			email: "first@example.com",
			name: "First",
		});
	});

	test("registration is closed once an admin exists", async () => {
		await signedIn();
		const response = await call("/api/auth/register", {
			method: "POST",
			body: { email: "intruder@example.com", password: PASSWORD },
		});
		expect(response.status).toBe(403);
		expect(await response.json()).toEqual({ error: "registration_closed" });
	});

	test("register rejects a short password with the minimum", async () => {
		const response = await call("/api/auth/register", {
			method: "POST",
			body: { email: "a@example.com", password: "short" },
		});
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			error: "weak_credentials",
			min: 8,
		});
	});

	test("login: missing fields, wrong password, then success with a session cookie", async () => {
		await signedIn();

		const missing = await call("/api/auth/login", {
			method: "POST",
			body: { email: "", password: "" },
		});
		expect(await missing.json()).toEqual({ error: "missing_credentials" });

		const wrong = await call("/api/auth/login", {
			method: "POST",
			body: { email: "first@example.com", password: "nope-nope-nope" },
		});
		expect(wrong.status).toBe(400);
		expect(await wrong.json()).toEqual({ error: "invalid_credentials" });

		const ok = await call("/api/auth/login", {
			method: "POST",
			body: { email: "first@example.com", password: PASSWORD },
		});
		expect(ok.status).toBe(200);
		const session = await (
			await call("/api/session", { cookie: cookieOf(ok) })
		).json();
		expect(session.admin?.email).toBe("first@example.com");
	});

	test("logout invalidates the session", async () => {
		const cookie = await signedIn();
		const out = await call("/api/auth/logout", { method: "POST", cookie });
		expect(out.status).toBe(204);
		expect(
			(await (await call("/api/session", { cookie })).json()).admin,
		).toBeNull();
	});

	test("guarded routes answer 401 without a session", async () => {
		expect((await call("/api/users")).status).toBe(401);
		expect((await call("/api/system")).status).toBe(401);
		expect((await call("/api/admins")).status).toBe(401);
	});
});

describe("cross-origin protection", () => {
	test("a state-changing request from a foreign Origin is refused", async () => {
		const cookie = await signedIn();
		const response = await call("/api/auth/logout", {
			method: "POST",
			cookie,
			origin: "http://evil.example",
		});
		expect(response.status).toBe(403);
		expect(
			(await (await call("/api/session", { cookie })).json()).admin,
		).not.toBeNull();
	});

	test("reads from another origin and origin-less clients are not blocked by it", async () => {
		const cookie = await signedIn();
		expect(
			(await call("/api/session", { cookie, origin: "http://evil.example" }))
				.status,
		).toBe(200);
		expect(
			(await call("/api/auth/logout", { method: "POST", cookie, origin: null }))
				.status,
		).toBe(204);
	});
});

describe("admins", () => {
	test("lists, creates, bans and unbans admins with the safety rules", async () => {
		const cookie = await signedIn();

		const weak = await call("/api/admins", {
			method: "POST",
			cookie,
			body: { email: "b@example.com", password: "short" },
		});
		expect(await weak.json()).toEqual({ error: "weak_credentials", min: 8 });

		const created = await call("/api/admins", {
			method: "POST",
			cookie,
			body: { email: "b@example.com", password: PASSWORD },
		});
		expect(created.status).toBe(200);

		const { admins } = await (await call("/api/admins", { cookie })).json();
		expect(admins.map((a: { email: string }) => a.email)).toEqual([
			"first@example.com",
			"b@example.com",
		]);
		const [first, second] = admins;

		const self = await call(`/api/admins/${first.id}/ban`, {
			method: "POST",
			cookie,
			body: {},
		});
		expect(await self.json()).toEqual({ error: "self" });

		const banned = await call(`/api/admins/${second.id}/ban`, {
			method: "POST",
			cookie,
			body: { reason: "left" },
		});
		expect(banned.status).toBe(200);
		const after = (await (await call("/api/admins", { cookie })).json()).admins;
		expect(after[1]).toMatchObject({ banned: true, banReason: "left" });

		expect(
			(await call(`/api/admins/${second.id}/unban`, { method: "POST", cookie }))
				.status,
		).toBe(200);
		expect(
			(await (await call("/api/admins", { cookie })).json()).admins[1].banned,
		).toBe(false);
	});

	test("the last active admin can't be banned", async () => {
		const cookie = await signedIn();
		await call("/api/admins", {
			method: "POST",
			cookie,
			body: { email: "b@example.com", password: PASSWORD },
		});
		const { admins } = await (await call("/api/admins", { cookie })).json();
		const [first, second] = admins;
		await call(`/api/admins/${second.id}/ban`, {
			method: "POST",
			cookie,
			body: {},
		});

		// `first` is now the only active admin; only `second` (banned) could try — self-ban is refused too.
		const response = await call(`/api/admins/${first.id}/ban`, {
			method: "POST",
			cookie,
			body: {},
		});
		expect(response.status).toBe(400);
	});

	test("set password enforces the minimum and reports unknown admins", async () => {
		const cookie = await signedIn();
		const { admins } = await (await call("/api/admins", { cookie })).json();
		const short = await call(`/api/admins/${admins[0].id}/password`, {
			method: "POST",
			cookie,
			body: { password: "x" },
		});
		expect(await short.json()).toEqual({ error: "weak_password", min: 8 });

		const ok = await call(`/api/admins/${admins[0].id}/password`, {
			method: "POST",
			cookie,
			body: { password: "another-long-password" },
		});
		expect(ok.status).toBe(200);

		const missing = await call("/api/admins/nope/ban", {
			method: "POST",
			cookie,
			body: {},
		});
		expect(missing.status).toBe(404);
	});
});

describe("orchestrator routes", () => {
	test("users list forwards the query with the admin key and no admin id", async () => {
		const cookie = await signedIn();
		respond = () => json({ items: [USER], nextCursor: null, total: 1 });

		const response = await call("/api/users?status=blocked&limit=5&q=ann", {
			cookie,
		});

		expect(response.status).toBe(200);
		expect((await response.json()).total).toBe(1);
		const req = upstream[0];
		expect(req?.url).toBe(
			"http://orchestrator/v1/admin/users?status=blocked&q=ann&limit=5",
		);
		expect(req?.headers.get("authorization")).toBe("Bearer admin-key");
		expect(req?.headers.get("x-admin-id")).toBeNull();
	});

	test("mutations carry the signed-in admin's id as X-Admin-Id", async () => {
		const cookie = await signedIn();
		const me = (await (await call("/api/session", { cookie })).json()).admin;
		respond = () => json({ user: USER });

		const response = await call("/api/users/u1/block", {
			method: "POST",
			cookie,
			body: { reason: "spam" },
		});

		expect(response.status).toBe(200);
		expect(upstream[0]?.url).toBe(
			"http://orchestrator/v1/admin/users/u1/block",
		);
		expect(upstream[0]?.body).toEqual({ reason: "spam" });
		expect(upstream[0]?.headers.get("x-admin-id")).toBe(me.id);
	});

	test("bulk needs a selection", async () => {
		const cookie = await signedIn();
		const empty = await call("/api/users/bulk", {
			method: "POST",
			cookie,
			body: { ids: [], action: "block" },
		});
		expect(empty.status).toBe(400);
		expect(await empty.json()).toEqual({ error: "no_selection" });
		expect(upstream).toHaveLength(0);

		respond = () => json({ updated: 2 });
		const ok = await call("/api/users/bulk", {
			method: "POST",
			cookie,
			body: { ids: ["a", "b"], action: "whitelist" },
		});
		expect(await ok.json()).toEqual({ updated: 2 });
	});

	test("orchestrator failures map to 404 / 502 / 503 with a message", async () => {
		const cookie = await signedIn();

		respond = () => new Response("", { status: 404, statusText: "Not Found" });
		const notFound = await call("/api/users/nope", { cookie });
		expect(notFound.status).toBe(404);
		expect(await notFound.json()).toMatchObject({
			message: expect.stringContaining("404"),
		});

		respond = () => new Response("", { status: 500 });
		expect((await call("/api/users/u1", { cookie })).status).toBe(502);

		respond = () => {
			throw new Error("ECONNREFUSED");
		};
		const down = await call("/api/users/u1", { cookie });
		expect(down.status).toBe(503);
	});

	test("channel creation validates slug and name, then returns the one-time secret", async () => {
		const cookie = await signedIn();

		const bad = await call("/api/channels", {
			method: "POST",
			cookie,
			body: { slug: "Bad Slug", name: "X" },
		});
		expect(await bad.json()).toEqual({ error: "invalid_channel" });
		expect(upstream).toHaveLength(0);

		respond = () => json({ channel: CHANNEL, secretKey: "sk" });
		const ok = await call("/api/channels", {
			method: "POST",
			cookie,
			body: {
				slug: "site",
				name: " Site ",
				allowedOrigins: ["https://shop.example"],
			},
		});
		expect(await ok.json()).toMatchObject({
			secretKey: "sk",
			channel: { slug: "site" },
		});
		expect(upstream[0]?.body).toEqual({
			slug: "site",
			name: "Site",
			kind: "web",
			accessMode: "open",
			allowedOrigins: ["https://shop.example"],
		});
	});

	test("a PATCH that omits accessMode doesn't send one (Optional enums must not default)", async () => {
		const cookie = await signedIn();
		respond = () => json({ channel: CHANNEL });
		await call("/api/channels/c1", {
			method: "PATCH",
			cookie,
			body: { disabled: true },
		});
		expect(upstream[0]?.body).toEqual({ disabled: true });
	});

	test("blocked IP creation validates before calling the orchestrator", async () => {
		const cookie = await signedIn();
		const bad = await call("/api/blocked-ips", {
			method: "POST",
			cookie,
			body: { ip: "1.2.3.4", reason: "spam", expiresInHours: 0 },
		});
		expect(await bad.json()).toEqual({ error: "invalid_block" });
		expect(upstream).toHaveLength(0);
	});

	test("deleting a blocked IP is a 204 passthrough", async () => {
		const cookie = await signedIn();
		respond = () => new Response(null, { status: 204 });
		const response = await call("/api/blocked-ips/b1", {
			method: "DELETE",
			cookie,
		});
		expect(response.status).toBe(204);
		expect(upstream[0]?.method).toBe("DELETE");
	});

	test("dashboard combines stats with usage by day, top users and channels", async () => {
		const cookie = await signedIn();
		const stats = {
			users: { total: 1, pending: 0, blocked: 0, anonymous: 0 },
			usage: { today: USAGE, last7d: USAGE, last30d: USAGE },
		};
		respond = ({ url }) => {
			if (url.endsWith("/stats")) return json(stats);
			const rows = (label: string, tokens: number) => ({
				...USAGE,
				inputTokens: tokens,
				key: label,
				label,
				avgLatencyMs: 1,
			});
			return json({ rows: [rows("small", 1), rows("big", 100)] });
		};

		const body = await (await call("/api/dashboard", { cookie })).json();

		expect(body.stats.users.total).toBe(1);
		expect(body.byDay[0]).toEqual({
			day: "small",
			inputTokens: 1,
			outputTokens: 2,
		});
		expect(body.topUsers.map((r: { label: string }) => r.label)).toEqual([
			"big",
			"small",
		]);
		expect(body.byChannel.map((r: { label: string }) => r.label)).toEqual([
			"big",
			"small",
		]);
	});
});

describe("system and docs", () => {
	test("system returns the host snapshot", async () => {
		const cookie = await signedIn();
		expect(await (await call("/api/system", { cookie })).json()).toEqual(
			SNAPSHOT,
		);
	});

	test("/health is open and Swagger documents the API", async () => {
		expect((await call("/health", { origin: null })).status).toBe(200);
		const spec = await (await call("/api/docs/json", { origin: null })).json();
		expect(Object.keys(spec.paths)).toEqual(
			expect.arrayContaining([
				"/api/session",
				"/api/users",
				"/api/channels",
				"/api/system",
			]),
		);
	});
});
