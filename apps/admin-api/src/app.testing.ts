import { join } from "node:path";
import { createObservability } from "@repo/elysia-kit";
import { type AdminApiDeps, createApp } from "./app.ts";
import { createAuth } from "./modules/auth/auth.ts";
import { openAdminDb } from "./modules/database/database.ts";
import { createOrchestratorClient } from "./modules/orchestrator/orchestrator.ts";
import type { SystemSnapshot } from "./modules/system/system.schema.ts";

// biome-ignore lint/suspicious/noExplicitAny: response bodies are inspected loosely in tests
type Json = any;
export type TestResponse = Omit<Response, "json"> & { json(): Promise<Json> };

export const ORIGIN = "http://localhost:3002";
export const PASSWORD = "correct-horse-battery";

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

/** An app over an in-memory database with a stub orchestrator; `overrides` replace any dependency. */
export function testApp(overrides: Partial<AdminApiDeps> = {}) {
	const db = openAdminDb(":memory:", join(import.meta.dir, "../drizzle"));
	const auth = createAuth({
		db,
		secret: "test-secret-test-secret-test-secret",
		baseURL: ORIGIN,
	});
	const app = createApp({
		observability: createObservability("admin-api", { LOG_LEVEL: "silent" }),
		auth,
		db,
		orchestrator: createOrchestratorClient({
			baseUrl: "http://orchestrator",
			apiKey: "admin-key",
			fetch: (async () => new Response("{}")) as unknown as typeof fetch,
		}),
		trustedOrigins: [ORIGIN],
		systemSnapshot: async () => SNAPSHOT,
		...overrides,
	});

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

	/** Registers the first admin and returns their session cookie. */
	async function registerFirst(email = "root@example.com") {
		const response = await call("/api/auth/register", {
			method: "POST",
			body: { email, password: PASSWORD, name: "Root" },
		});
		return cookieOf(response);
	}

	/** Creates another admin (as `cookie`) and returns their own session cookie. */
	async function addAdmin(cookie: string, email: string) {
		const created = await call("/api/admins", {
			method: "POST",
			cookie,
			body: { email, password: PASSWORD },
		});
		const login = await call("/api/auth/login", {
			method: "POST",
			body: { email, password: PASSWORD },
		});
		return { id: (await created.json()).id as string, cookie: cookieOf(login) };
	}

	return { app, db, auth, call, cookieOf, registerFirst, addAdmin };
}
