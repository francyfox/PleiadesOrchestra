import { describe, expect, test } from "bun:test";
import { Elysia, t } from "elysia";
import { setupAdminApp } from "../http/http.testing.ts";
import { authorizeAdmin, authorizeTransport } from "./auth.service.ts";
import { guarded } from "./auth.ts";

const keys = { apiKey: "transport", adminApiKey: "admin" };
const bearer = (key: string) => ({ authorization: `Bearer ${key}` });
const request = (path: string, init: RequestInit = {}) =>
	new Request(`http://localhost${path}`, init);

describe("keys", () => {
	test("transport routes need the transport key, not the admin key", () => {
		expect(authorizeTransport(request("/v1/messages"), keys)?.status).toBe(401);
		expect(
			authorizeTransport(
				request("/v1/messages", { headers: bearer("admin") }),
				keys,
			)?.status,
		).toBe(401);
		expect(
			authorizeTransport(
				request("/v1/messages", { headers: bearer("transport") }),
				keys,
			),
		).toBeUndefined();
	});

	test("admin routes need the admin key, not the transport key", () => {
		const get = (key: string) =>
			request("/v1/admin/visitors", { headers: bearer(key) });
		expect(authorizeAdmin(get("transport"), keys)?.status).toBe(401);
		expect(authorizeAdmin(get("admin"), keys)).toBeUndefined();
	});

	test("admin mutations also need X-Admin-Id", () => {
		const post = (headers: Record<string, string>) =>
			request("/v1/admin/visitors/bulk", { method: "POST", headers });
		expect(authorizeAdmin(post(bearer("admin")), keys)).toEqual({
			status: 400,
			body: "X-Admin-Id header required",
		});
		expect(
			authorizeAdmin(post({ ...bearer("admin"), "x-admin-id": "a1" }), keys),
		).toBeUndefined();
	});
});

describe("guarded", () => {
	const app = new Elysia()
		.get("/open", () => "ok")
		.use(
			guarded((r) => authorizeTransport(r, keys)).post(
				"/closed",
				({ body }) => body,
				{
					body: t.Object({ a: t.String() }),
				},
			),
		);
	const post = (body: string, headers: Record<string, string> = {}) =>
		app.handle(
			request("/closed", {
				method: "POST",
				body,
				headers: { "content-type": "application/json", ...headers },
			}),
		);

	test("only the routes of its group are checked", async () => {
		expect((await app.handle(request("/open"))).status).toBe(200);
		expect((await post('{"a":"x"}')).status).toBe(401);
		expect((await post('{"a":"x"}', bearer("transport"))).status).toBe(200);
	});

	test("the key is checked before the body is validated", async () => {
		expect((await post("{}")).status).toBe(401);
		expect((await post("{}", bearer("transport"))).status).toBe(422);
	});
});

describe("the real app", () => {
	// Every route is open on purpose or behind the key of its path; a route added to the wrong group fails here.
	const OPEN = [
		"/health",
		"/swagger",
		"/v1/public/",
		"/v1/widget/",
		"/v1/billing/polar",
	];
	const identify = /^\/v1\/channels\/[^/]+\/identify$/;
	const isOpen = (path: string) =>
		OPEN.some((open) => path.startsWith(open)) || identify.test(path);

	test("every other route rejects a request without a key", async () => {
		const { app } = setupAdminApp();
		const routes = app.routes.filter(
			(route) =>
				!isOpen(route.path) &&
				route.method !== "OPTIONS" &&
				!route.path.startsWith("/swagger"),
		);
		expect(routes.length).toBeGreaterThan(20);
		for (const route of routes) {
			const path = route.path.replace(/:[^/]+/g, "x").replace("*", "x");
			const response = await app.handle(
				request(path, { method: route.method }),
			);
			expect([route.method, route.path, response.status]).toEqual([
				route.method,
				route.path,
				401,
			]);
		}
	});

	test("health and the public price list need no key", async () => {
		const { app } = setupAdminApp();
		for (const path of ["/health", "/v1/public/pricing"]) {
			expect((await app.handle(request(path))).status).toBe(200);
		}
	});
});
