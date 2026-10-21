import { describe, expect, test } from "bun:test";
import { CHANNEL, VISITOR } from "../../app.harness.testing.ts";
import { fakeOrchestrator, testApp } from "../../app.testing.ts";

const BLOCK = {
	id: "b-mine",
	ipHash: "h",
	ip: "1.1.1.1",
	channelId: "mine",
	reason: "spam",
	createdAt: 1,
	expiresAt: 2,
};

/** A fake orchestrator that knows one channel, visitor, request and block of ann's; everything else is someone else's. */
async function setup() {
	const owners: Record<string, string> = {};
	const fake = fakeOrchestrator((call) => {
		const url = new URL(call.path, "http://x");
		const ownerId = url.searchParams.get("ownerId");
		const foreign = ownerId !== null && ownerId !== owners.ann;
		const path = url.pathname;
		if (path === "/v1/admin/channels") {
			const items = [{ ...CHANNEL, id: "mine", ownerId: owners.ann }];
			return Response.json({ items: foreign ? [] : items, total: 1 });
		}
		if (path === "/v1/admin/visitors")
			return Response.json({ items: [], nextCursor: null, total: 0 });
		if (path === "/v1/admin/visitors/bulk")
			return Response.json({ updated: 1 });
		if (path.startsWith("/v1/admin/visitors/")) {
			if (call.method === "GET") {
				if (foreign || (ownerId && !path.endsWith("/v-mine")))
					return new Response("Not found", { status: 404 });
				return Response.json({
					visitor: VISITOR,
					messages: [],
					usageByDay: [],
					usageByModel: [],
				});
			}
			if (call.method === "DELETE") return new Response(null, { status: 204 });
			return Response.json({ visitor: VISITOR });
		}
		if (path === "/v1/admin/requests")
			return Response.json({ items: [], total: 0 });
		if (path.startsWith("/v1/admin/requests/"))
			return new Response("Not found", { status: 404 });
		if (path === "/v1/admin/blocked-ips") {
			if (call.method === "POST") return Response.json({ item: BLOCK });
			return Response.json({ items: foreign ? [] : [BLOCK], total: 1 });
		}
		if (path.startsWith("/v1/admin/blocked-ips/"))
			return new Response(null, { status: 204 });
		return Response.json({});
	});
	const t = testApp({ orchestrator: fake.client });
	const ann = await t.signedUser("ann@example.com");
	const rows = await t.db.query.user.findMany();
	owners.ann = rows.find((row) => row.email === "ann@example.com")
		?.id as string;
	return { t, calls: fake.calls, ann, annId: owners.ann as string };
}

describe("a user's visitors, flow and blocked IPs: only their channels", () => {
	test("lists are scoped to the session's owner", async () => {
		const { t, calls, ann, annId } = await setup();
		for (const path of [
			"/api/visitors?ownerId=other",
			"/api/requests",
			"/api/blocked-ips",
		]) {
			expect((await t.call(path, { cookie: ann })).status).toBe(200);
			expect(calls.at(-1)?.path).toContain(`ownerId=${annId}`);
			expect(calls.at(-1)?.path).not.toContain("other");
		}
	});

	test("another owner's visitor: detail and every mutation are 404 and never written", async () => {
		const { t, calls, ann } = await setup();
		expect(
			(await t.call("/api/visitors/v-theirs", { cookie: ann })).status,
		).toBe(404);
		for (const [method, path] of [
			["POST", "/api/visitors/v-theirs/block"],
			["POST", "/api/visitors/v-theirs/whitelist"],
			["DELETE", "/api/visitors/v-theirs/messages"],
		] as const) {
			const response = await t.call(path, { method, cookie: ann, body: {} });
			expect([path, response.status]).toEqual([path, 404]);
		}
		expect(calls.filter((c) => c.method !== "GET")).toHaveLength(0);

		const own = await t.call("/api/visitors/v-mine/block", {
			method: "POST",
			cookie: ann,
			body: {},
		});
		expect(own.status).toBe(200);
		expect(calls.at(-1)?.method).toBe("POST");
	});

	test("bulk carries the owner, so foreign ids are skipped upstream", async () => {
		const { t, calls, ann, annId } = await setup();
		await t.call("/api/visitors/bulk", {
			method: "POST",
			cookie: ann,
			body: { ids: ["a", "b"], action: "block" },
		});
		expect(calls.at(-1)?.body).toMatchObject({ ownerId: annId });
	});

	test("a request is opened with the owner (trace too)", async () => {
		const { t, calls, ann, annId } = await setup();
		for (const path of ["/api/requests/r1", "/api/requests/r1/trace"]) {
			expect((await t.call(path, { cookie: ann })).status).toBe(404);
			expect(calls.at(-1)?.path).toContain(`ownerId=${annId}`);
		}
	});

	test("blocks: a user's block needs their own channel; deleting checks the owner", async () => {
		const { t, calls, ann } = await setup();
		const body = { ip: "1.1.1.1", reason: "spam", expiresInHours: 1 };
		const global = await t.call("/api/blocked-ips", {
			method: "POST",
			cookie: ann,
			body,
		});
		expect(global.status).toBe(400);
		const foreign = await t.call("/api/blocked-ips", {
			method: "POST",
			cookie: ann,
			body: { ...body, channelId: "theirs" },
		});
		expect(foreign.status).toBe(404);
		expect(
			(
				await t.call("/api/blocked-ips/b-theirs", {
					method: "DELETE",
					cookie: ann,
				})
			).status,
		).toBe(404);
		expect(calls.filter((c) => c.method !== "GET")).toHaveLength(0);

		const own = await t.call("/api/blocked-ips", {
			method: "POST",
			cookie: ann,
			body: { ...body, channelId: "mine" },
		});
		expect(own.status).toBe(200);
		const removed = await t.call("/api/blocked-ips/b-mine", {
			method: "DELETE",
			cookie: ann,
		});
		expect(removed.status).toBe(204);
	});

	test("staff are not scoped and may still block globally", async () => {
		const { t, calls } = await setup();
		const staff = await t.registerFirst();
		await t.call("/api/visitors", { cookie: staff });
		expect(calls.at(-1)?.path).not.toContain("ownerId");
		const response = await t.call("/api/blocked-ips", {
			method: "POST",
			cookie: staff,
			body: { ip: "1.1.1.1", reason: "spam", expiresInHours: 1 },
		});
		expect(response.status).toBe(200);
	});
});
