import { describe, expect, test } from "bun:test";
import { authorizeRequest } from "./auth.service.ts";

const keys = { apiKey: "transport", adminApiKey: "admin" };

function request(path: string, init: RequestInit = {}) {
	return new Request(`http://localhost${path}`, init);
}
const bearer = (key: string) => ({ authorization: `Bearer ${key}` });

describe("authorizeRequest", () => {
	test("health, swagger and the widget's public routes need no key", () => {
		for (const path of [
			"/health",
			"/swagger",
			"/v1/widget/messages",
			"/v1/channels/shop/identify",
		]) {
			expect(authorizeRequest(request(path), keys)).toBeUndefined();
		}
	});

	test("transport routes need the transport key, not the admin key", () => {
		expect(authorizeRequest(request("/v1/messages"), keys)?.status).toBe(401);
		expect(
			authorizeRequest(
				request("/v1/messages", { headers: bearer("admin") }),
				keys,
			)?.status,
		).toBe(401);
		expect(
			authorizeRequest(
				request("/v1/messages", { headers: bearer("transport") }),
				keys,
			),
		).toBeUndefined();
	});

	test("admin routes need the admin key, not the transport key", () => {
		expect(
			authorizeRequest(
				request("/v1/admin/users", { headers: bearer("transport") }),
				keys,
			)?.status,
		).toBe(401);
		expect(
			authorizeRequest(
				request("/v1/admin/users", { headers: bearer("admin") }),
				keys,
			),
		).toBeUndefined();
	});

	test("admin mutations also need X-Admin-Id", () => {
		const withoutId = request("/v1/admin/users/bulk", {
			method: "POST",
			headers: bearer("admin"),
		});
		expect(authorizeRequest(withoutId, keys)).toEqual({
			status: 400,
			body: "X-Admin-Id header required",
		});
		const withId = request("/v1/admin/users/bulk", {
			method: "POST",
			headers: { ...bearer("admin"), "x-admin-id": "a1" },
		});
		expect(authorizeRequest(withId, keys)).toBeUndefined();
	});
});
