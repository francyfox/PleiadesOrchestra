import { describe, expect, test } from "bun:test";
import { call, signedIn, useHarness } from "../../app.harness.testing.ts";

useHarness();

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
