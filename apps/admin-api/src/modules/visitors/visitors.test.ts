import { describe, expect, test } from "bun:test";
import {
	call,
	json,
	setRespond,
	signedIn,
	upstream,
	useHarness,
	VISITOR,
} from "../../app.harness.testing.ts";

useHarness();

describe("visitors (proxied to the orchestrator)", () => {
	test("visitors list forwards the query with the admin key and no admin id", async () => {
		const cookie = await signedIn();
		setRespond(() => json({ items: [VISITOR], nextCursor: null, total: 1 }));

		const response = await call("/api/visitors?status=blocked&limit=5&q=ann", {
			cookie,
		});

		expect(response.status).toBe(200);
		const page = await response.json();
		expect(page.total).toBe(1);
		// The generated name survives the response schema.
		expect(page.items[0].name).toBe(VISITOR.name);
		const req = upstream[0];
		expect(req?.url).toBe(
			"http://orchestrator/v1/admin/visitors?status=blocked&q=ann&limit=5",
		);
		expect(req?.headers.get("authorization")).toBe("Bearer admin-key");
		expect(req?.headers.get("x-admin-id")).toBeNull();
	});

	test("mutations carry the signed-in admin's id as X-Admin-Id", async () => {
		const cookie = await signedIn();
		const me = (await (await call("/api/session", { cookie })).json()).admin;
		setRespond(() => json({ visitor: VISITOR }));

		const response = await call("/api/visitors/u1/block", {
			method: "POST",
			cookie,
			body: { reason: "spam" },
		});

		expect(response.status).toBe(200);
		expect(upstream[0]?.url).toBe(
			"http://orchestrator/v1/admin/visitors/u1/block",
		);
		expect(upstream[0]?.body).toEqual({ reason: "spam" });
		expect(upstream[0]?.headers.get("x-admin-id")).toBe(me.id);
	});

	test("bulk needs a selection", async () => {
		const cookie = await signedIn();
		const empty = await call("/api/visitors/bulk", {
			method: "POST",
			cookie,
			body: { ids: [], action: "block" },
		});
		expect(empty.status).toBe(400);
		expect(await empty.json()).toEqual({ error: "no_selection" });
		expect(upstream).toHaveLength(0);

		setRespond(() => json({ updated: 2 }));
		const ok = await call("/api/visitors/bulk", {
			method: "POST",
			cookie,
			body: { ids: ["a", "b"], action: "whitelist" },
		});
		expect(await ok.json()).toEqual({ updated: 2 });
	});

	test("the old /api/users path is gone", async () => {
		const cookie = await signedIn();
		expect((await call("/api/users", { cookie })).status).toBe(404);
		expect((await call("/api/users/u1", { cookie })).status).toBe(404);
	});
});
