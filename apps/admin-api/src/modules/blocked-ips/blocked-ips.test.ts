import { describe, expect, test } from "bun:test";
import {
	call,
	setRespond,
	signedIn,
	upstream,
	useHarness,
} from "../../app.harness.testing.ts";

useHarness();

describe("blocked IPs (proxied)", () => {
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
		setRespond(() => new Response(null, { status: 204 }));
		const response = await call("/api/blocked-ips/b1", {
			method: "DELETE",
			cookie,
		});
		expect(response.status).toBe(204);
		expect(upstream[0]?.method).toBe("DELETE");
	});
});
