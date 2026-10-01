import { beforeEach, describe, expect, test } from "bun:test";
import { PASSWORD, testApp } from "../../app.testing.ts";

let t: ReturnType<typeof testApp>;
let rootCookie: string;
let rootId: string;
let peer: { id: string; cookie: string };
let other: { id: string; cookie: string };

beforeEach(async () => {
	t = testApp();
	rootCookie = await t.registerFirst();
	const { admins } = await (
		await t.call("/api/admins", { cookie: rootCookie })
	).json();
	rootId = admins[0].id;
	peer = await t.addAdmin(rootCookie, "peer@example.com");
	other = await t.addAdmin(rootCookie, "other@example.com");
});

const del = (id: string, cookie: string) =>
	t.call(`/api/admins/${id}`, { method: "DELETE", cookie });

describe("super admin", () => {
	test("the first account is super, in the list and in the session", async () => {
		const { admins, total } = await (
			await t.call("/api/admins", { cookie: rootCookie })
		).json();
		expect(total).toBe(3);
		expect(admins.map((a: { isSuper: boolean }) => a.isSuper)).toEqual([
			true,
			false,
			false,
		]);
		const own = await (
			await t.call("/api/session", { cookie: rootCookie })
		).json();
		expect(own.admin.isSuper).toBe(true);
		const theirs = await (
			await t.call("/api/session", { cookie: peer.cookie })
		).json();
		expect(theirs.admin.isSuper).toBe(false);
	});

	test("the super admin deletes another admin, who is gone afterwards", async () => {
		const response = await del(peer.id, rootCookie);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ id: peer.id });
		const { admins, total } = await (
			await t.call("/api/admins", { cookie: rootCookie })
		).json();
		expect(total).toBe(2);
		expect(admins.map((a: { id: string }) => a.id)).not.toContain(peer.id);
		expect(
			(await (await t.call("/api/session", { cookie: peer.cookie })).json())
				.admin,
		).toBeNull();
	});

	test("a regular admin can't delete anyone, the super admin included", async () => {
		for (const target of [rootId, other.id]) {
			const response = await del(target, peer.cookie);
			expect(response.status).toBe(403);
			expect(await response.json()).toEqual({ error: "not_super" });
		}
		expect(
			(await (await t.call("/api/admins", { cookie: rootCookie })).json())
				.total,
		).toBe(3);
	});

	test("the super admin can't delete themselves; unknown ids are 404", async () => {
		const self = await del(rootId, rootCookie);
		expect(self.status).toBe(400);
		expect(await self.json()).toEqual({ error: "self" });
		const missing = await del("nope", rootCookie);
		expect(missing.status).toBe(404);
		expect(await missing.json()).toEqual({ error: "not_found" });
	});

	test("deleting needs a session", async () => {
		expect(
			(await t.call(`/api/admins/${peer.id}`, { method: "DELETE" })).status,
		).toBe(401);
	});

	test("only the super admin can change the super admin's password", async () => {
		const path = `/api/admins/${rootId}/password`;
		const denied = await t.call(path, {
			method: "POST",
			cookie: peer.cookie,
			body: { password: "another-long-password" },
		});
		expect(denied.status).toBe(403);
		expect(await denied.json()).toEqual({ error: "super_protected" });

		const own = await t.call(path, {
			method: "POST",
			cookie: rootCookie,
			body: { password: "another-long-password" },
		});
		expect(own.status).toBe(200);
	});

	test("regular admins can still change each other's passwords", async () => {
		const response = await t.call(`/api/admins/${other.id}/password`, {
			method: "POST",
			cookie: peer.cookie,
			body: { password: "another-long-password" },
		});
		expect(response.status).toBe(200);
	});

	test("nobody else can ban the super admin", async () => {
		const response = await t.call(`/api/admins/${rootId}/ban`, {
			method: "POST",
			cookie: peer.cookie,
			body: {},
		});
		expect(response.status).toBe(403);
		expect(await response.json()).toEqual({ error: "super_protected" });
	});
});

describe("admin list pagination", () => {
	const list = async (query: string) =>
		(await t.call(`/api/admins${query}`, { cookie: rootCookie })).json();

	test("pages are ordered oldest first and total counts every account", async () => {
		const first = await list("?page=1&pageSize=2");
		expect(first.total).toBe(3);
		expect(first.admins.map((a: { email: string }) => a.email)).toEqual([
			"root@example.com",
			"peer@example.com",
		]);
		const second = await list("?page=2&pageSize=2");
		expect(second.admins.map((a: { email: string }) => a.email)).toEqual([
			"other@example.com",
		]);
		expect(second.total).toBe(3);
	});

	test("without pageSize everything comes back", async () => {
		expect((await list("")).admins).toHaveLength(3);
		expect((await list("?page=2")).admins).toHaveLength(3);
	});

	test("page size is capped at 100", async () => {
		const response = await t.call("/api/admins?pageSize=101", {
			cookie: rootCookie,
		});
		expect(response.status).toBe(422);
	});
});

test("passwords stay valid for login after a super-protected refusal", async () => {
	await t.call(`/api/admins/${rootId}/password`, {
		method: "POST",
		cookie: peer.cookie,
		body: { password: "another-long-password" },
	});
	const login = await t.call("/api/auth/login", {
		method: "POST",
		body: { email: "root@example.com", password: PASSWORD },
	});
	expect(login.status).toBe(200);
});
