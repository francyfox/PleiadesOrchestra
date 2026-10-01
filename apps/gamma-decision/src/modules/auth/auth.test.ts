import { expect, test } from "bun:test";
import { authorizeRequest } from "./auth.service.ts";

const request = (path: string, authorization?: string) =>
	new Request(`http://localhost${path}`, {
		headers: authorization ? { authorization } : {},
	});

test("health and swagger are open", () => {
	expect(authorizeRequest(request("/health"), "k")).toBeUndefined();
	expect(authorizeRequest(request("/swagger"), "k")).toBeUndefined();
});

test("other routes need the bearer key", () => {
	expect(authorizeRequest(request("/v1/decide"), "k")?.status).toBe(401);
	expect(
		authorizeRequest(request("/v1/decide", "Bearer no"), "k")?.status,
	).toBe(401);
	expect(
		authorizeRequest(request("/v1/decide", "Bearer k"), "k"),
	).toBeUndefined();
});
