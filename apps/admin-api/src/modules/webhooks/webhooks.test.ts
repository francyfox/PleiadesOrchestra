import { describe, expect, test } from "bun:test";
import { fakeOrchestrator, testApp } from "../../app.testing.ts";

const HOOK = {
	id: "w1",
	name: "Ops",
	url: "https://a.example/h",
	events: ["run.failed"],
	format: "json",
	enabled: true,
	lastStatus: null,
	lastError: null,
	lastAt: null,
	createdAt: 1,
};

function setup() {
	const fake = fakeOrchestrator((call) => {
		if (call.method === "DELETE") return new Response(null, { status: 204 });
		if (call.method === "GET")
			return Response.json({ items: [HOOK], events: [] });
		if (call.path.endsWith("/test"))
			return Response.json({ status: 200, error: null });
		return Response.json({ item: HOOK, secret: "whsec_x" });
	});
	return { t: testApp({ orchestrator: fake.client }), calls: fake.calls };
}

describe("webhooks (proxied)", () => {
	test("a customer's calls always carry their own account id, whatever the client sends", async () => {
		const { t, calls } = setup();
		const ann = await t.signedUser("ann@example.com");
		const annId = (await t.db.query.user.findMany()).find(
			(row) => row.email === "ann@example.com",
		)?.id as string;

		await t.call("/api/webhooks?ownerId=other", { cookie: ann });
		expect(calls.at(-1)?.path).toBe(`/v1/admin/webhooks?ownerId=${annId}`);

		await t.call("/api/webhooks", {
			method: "POST",
			cookie: ann,
			body: {
				name: "Ops",
				url: "https://a.example/h",
				events: ["run.failed"],
				ownerId: "other",
			},
		});
		expect(calls.at(-1)?.body).toMatchObject({ ownerId: annId });

		for (const [method, path] of [
			["PATCH", "/api/webhooks/w1"],
			["POST", "/api/webhooks/w1/secret"],
			["POST", "/api/webhooks/w1/test"],
			["DELETE", "/api/webhooks/w1"],
		] as const) {
			await t.call(path, {
				method,
				cookie: ann,
				body: method === "PATCH" ? { enabled: false } : undefined,
			});
			expect([path, calls.at(-1)?.path]).toEqual([
				path,
				`${path.replace("/api", "/v1/admin")}?ownerId=${annId}`,
			]);
		}
	});

	test("staff are not scoped; anonymous callers are refused", async () => {
		const { t, calls } = setup();
		const staff = await t.registerFirst();
		expect((await t.call("/api/webhooks", { cookie: staff })).status).toBe(200);
		expect(calls.at(-1)?.path).toBe("/v1/admin/webhooks");
		expect((await t.call("/api/webhooks")).status).toBe(401);
	});
});
