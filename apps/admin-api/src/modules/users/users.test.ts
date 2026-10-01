import { describe, expect, test } from "bun:test";
import {
	call,
	json,
	setRespond,
	signedIn,
	USER,
	upstream,
	useHarness,
} from "../../app.harness.testing.ts";

useHarness();

describe("users (proxied to the orchestrator)", () => {
	test("users list forwards the query with the admin key and no admin id", async () => {
		const cookie = await signedIn();
		setRespond(() => json({ items: [USER], nextCursor: null, total: 1 }));

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
		setRespond(() => json({ user: USER }));

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

		setRespond(() => json({ updated: 2 }));
		const ok = await call("/api/users/bulk", {
			method: "POST",
			cookie,
			body: { ids: ["a", "b"], action: "whitelist" },
		});
		expect(await ok.json()).toEqual({ updated: 2 });
	});
});
