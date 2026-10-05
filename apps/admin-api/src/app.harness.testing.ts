import { beforeEach, expect } from "bun:test";
import { join } from "node:path";
import { createObservability } from "@repo/elysia-kit";
import { type AdminApiDeps, createApp } from "./app.ts";
import { createAuth } from "./modules/auth/auth.ts";
import { openAdminDb } from "./modules/database/database.ts";
import { createOrchestratorClient } from "./modules/orchestrator/orchestrator.ts";
import type { SystemSnapshot } from "./modules/system/system.schema.ts";

export const MIGRATIONS = join(import.meta.dir, "../drizzle");
export const ORIGIN = "http://localhost:3002";
export const PASSWORD = "correct-horse-battery";

export interface Upstream {
	method: string;
	url: string;
	headers: Headers;
	body: unknown;
}

export const json = (value: unknown, status = 200) =>
	new Response(JSON.stringify(value), {
		status,
		headers: { "content-type": "application/json" },
	});

export const SNAPSHOT: SystemSnapshot = {
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

export const USAGE = {
	inputTokens: 1,
	outputTokens: 2,
	calls: 1,
	callsWithoutUsage: 0,
};
export const CHANNEL = {
	id: "c1",
	slug: "site",
	name: "Site",
	kind: "web",
	accessMode: "open",
	allowedOrigins: [],
	catalogLanguage: "en",
	publishableKey: "pk",
	disabledAt: null,
	createdAt: 1,
};
export const USER = {
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

export let upstream: Upstream[];
let respond: (req: Upstream) => Response;

/** What the fake orchestrator answers next. */
export function setRespond(fn: (req: Upstream) => Response) {
	respond = fn;
}
let app: ReturnType<typeof createApp>;

/** Call once at the top of a test file: a fresh app + fake orchestrator before every test. */
export function useHarness() {
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
}

// biome-ignore lint/suspicious/noExplicitAny: response bodies are inspected loosely in tests
type Json = any;
export type TestResponse = Omit<Response, "json"> & { json(): Promise<Json> };

export function call(
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

export const cookieOf = (response: Response) =>
	response.headers
		.getSetCookie()
		.map((value) => value.split(";")[0])
		.join("; ");

export async function signedIn(email = "first@example.com") {
	const response = await call("/api/auth/register", {
		method: "POST",
		body: { email, password: PASSWORD, name: "First" },
	});
	expect(response.status).toBe(200);
	return cookieOf(response);
}
