import { join } from "node:path";
import { createObservability } from "@repo/elysia-kit";
import { type AdminApiDeps, createApp } from "./app.ts";
import { createStaff } from "./modules/admins/admins.service.ts";
import { createAuth } from "./modules/auth/auth.ts";
import { openAdminDb } from "./modules/database/database.ts";
import { createFakeMailer } from "./modules/mail/mail.testing.ts";
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

export interface UpstreamCall {
	method: string;
	path: string;
	adminId: string | null;
	body: unknown;
}

/**
 * An orchestrator client that records its calls and answers with `respond`
 * (default `{}` 200). Pass `client` as `testApp({ orchestrator })`.
 */
export function fakeOrchestrator(
	respond: (call: UpstreamCall) => Response = () => Response.json({}),
) {
	const calls: UpstreamCall[] = [];
	const client = createOrchestratorClient({
		baseUrl: "http://orchestrator",
		apiKey: "admin-key",
		fetch: (async (input: string | URL | Request, init?: RequestInit) => {
			const call = {
				method: init?.method ?? "GET",
				path: String(input).replace("http://orchestrator", ""),
				adminId: new Headers(init?.headers).get("x-admin-id"),
				body: init?.body ? JSON.parse(String(init.body)) : undefined,
			};
			calls.push(call);
			return respond(call);
		}) as unknown as typeof fetch,
	});
	return { client, calls };
}

/** An app over an in-memory database with a stub orchestrator; `overrides` replace any dependency. */
export function testApp(overrides: Partial<AdminApiDeps> = {}) {
	const db = openAdminDb(":memory:", join(import.meta.dir, "../drizzle"));
	const mailer = createFakeMailer();
	const orchestrator = overrides.orchestrator ?? fakeOrchestrator().client;
	const auth = createAuth({
		db,
		secret: "test-secret-test-secret-test-secret",
		baseURL: ORIGIN,
		mailer,
		panelUrl: ORIGIN,
		now: overrides.now,
	});
	const app = createApp({
		observability: createObservability("admin-api", { LOG_LEVEL: "silent" }),
		auth,
		db,
		orchestrator,
		mailer,
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

	/** Signs in with an access token and returns the session cookie. */
	async function signInWith(token: string) {
		const response = await call("/api/auth/token", {
			method: "POST",
			body: { token },
		});
		return cookieOf(response);
	}

	/** Creates a super admin and returns their session cookie. */
	async function registerFirst(email = "root@example.com") {
		const { token } = await createStaff(auth, {
			name: "Root",
			email,
			level: 0,
		});
		return signInWith(token);
	}

	/** Creates another admin (as `cookie`, a super admin) and returns their id, token and session cookie. */
	async function addAdmin(cookie: string, email: string) {
		const created = await call("/api/admins", {
			method: "POST",
			cookie,
			body: { email, name: email },
		});
		const { id, token } = await created.json();
		return {
			id: id as string,
			token: token as string,
			cookie: await signInWith(token),
		};
	}

	/** Registers a customer, opens the mailed verification link, signs in and returns the session cookie. */
	async function signedUser(email = "user@example.com") {
		await call("/api/user/register", {
			method: "POST",
			body: { email, password: PASSWORD },
		});
		const link = mailer.sent.findLast((mail) => mail.to === email)?.link ?? "";
		await app.handle(new Request(link.replace(ORIGIN, "http://localhost")));
		const login = await call("/api/user/login", {
			method: "POST",
			body: { email, password: PASSWORD },
		});
		return cookieOf(login);
	}

	return {
		app,
		db,
		auth,
		mailer,
		orchestrator,
		call,
		cookieOf,
		signInWith,
		signedUser,
		registerFirst,
		addAdmin,
	};
}
