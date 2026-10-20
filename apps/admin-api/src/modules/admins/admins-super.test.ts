import { beforeEach, describe, expect, test } from "bun:test";
import { testApp } from "../../app.testing.ts";

let t: ReturnType<typeof testApp>;
let rootCookie: string;
let rootId: string;
let peer: { id: string; token: string; cookie: string };
let other: { id: string; token: string; cookie: string };

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
const patch = (id: string, cookie: string, body: unknown) =>
	t.call(`/api/admins/${id}`, { method: "PATCH", cookie, body });
const rotate = (id: string, cookie: string) =>
	t.call(`/api/admins/${id}/token`, { method: "POST", cookie });

describe("super admin", () => {
	test("level 0 is super in the list and in the session; level 100 is not", async () => {
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
		expect(own.admin).toMatchObject({ isSuper: true, level: 0 });
		const theirs = await (
			await t.call("/api/session", { cookie: peer.cookie })
		).json();
		expect(theirs.admin).toMatchObject({ isSuper: false, level: 100 });
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
		expect(
			(
				await t.call("/api/auth/token", {
					method: "POST",
					body: { token: peer.token },
				})
			).status,
		).toBe(401);
	});

	test("a level-100 admin can't delete, create or rotate/edit others, the super admin included", async () => {
		for (const target of [rootId, other.id]) {
			for (const response of [
				await del(target, peer.cookie),
				await patch(target, peer.cookie, { name: "x", email: "x@example.com" }),
				await rotate(target, peer.cookie),
			]) {
				expect(response.status).toBe(403);
				expect(await response.json()).toEqual({ error: "not_super" });
			}
		}
		const created = await t.call("/api/admins", {
			method: "POST",
			cookie: peer.cookie,
			body: { email: "new@example.com", name: "New" },
		});
		expect(created.status).toBe(403);
		expect(await created.json()).toEqual({ error: "not_super" });
		const { total } = await (
			await t.call("/api/admins", { cookie: rootCookie })
		).json();
		expect(total).toBe(3);
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

describe("staff tokens", () => {
	test("create returns the token once; the list never shows it or its hash", async () => {
		const created = await t.call("/api/admins", {
			method: "POST",
			cookie: rootCookie,
			body: { email: "New@Example.com", name: "New" },
		});
		const { id, token } = await created.json();
		expect(token).toHaveLength(43);
		const text = await (
			await t.call("/api/admins", { cookie: rootCookie })
		).text();
		expect(text).not.toContain(token);
		expect(text).not.toContain("tokenHash");
		expect(text).toContain('"new@example.com"');
		expect(await t.signInWith(token)).toContain("session_token");
		expect(id).toBeString();
	});

	test("a taken email is 409 email_taken (staff or customer)", async () => {
		await t.signedUser("customer@example.com");
		for (const email of ["peer@example.com", "customer@example.com"]) {
			const response = await t.call("/api/admins", {
				method: "POST",
				cookie: rootCookie,
				body: { email, name: "X" },
			});
			expect(response.status).toBe(409);
			expect(await response.json()).toEqual({ error: "email_taken" });
		}
	});

	test("rotating: the old token stops, the sessions are dropped, the new token works", async () => {
		const response = await rotate(peer.id, rootCookie);
		expect(response.status).toBe(200);
		const { token } = await response.json();
		expect(token).not.toBe(peer.token);

		expect(
			(await (await t.call("/api/session", { cookie: peer.cookie })).json())
				.admin,
		).toBeNull();
		const old = await t.call("/api/auth/token", {
			method: "POST",
			body: { token: peer.token },
		});
		expect(old.status).toBe(401);
		expect(await t.signInWith(token)).toContain("session_token");
	});

	test("an admin rotates their own token and edits their own name and email", async () => {
		const edit = await patch(peer.id, peer.cookie, {
			name: "Peer P",
			email: "peer2@example.com",
		});
		expect(edit.status).toBe(200);
		const { admins } = await (
			await t.call("/api/admins", { cookie: rootCookie })
		).json();
		expect(admins[1]).toMatchObject({
			name: "Peer P",
			email: "peer2@example.com",
		});

		const own = await rotate(peer.id, peer.cookie);
		expect(own.status).toBe(200);
		expect(
			(
				await t.call("/api/auth/token", {
					method: "POST",
					body: { token: peer.token },
				})
			).status,
		).toBe(401);
	});

	test("editing validates the email and refuses one another account holds", async () => {
		const invalid = await patch(peer.id, rootCookie, {
			name: "P",
			email: "nope",
		});
		expect(await invalid.json()).toEqual({ error: "invalid_email" });
		const taken = await patch(peer.id, rootCookie, {
			name: "P",
			email: "other@example.com",
		});
		expect(taken.status).toBe(409);
		const same = await patch(peer.id, rootCookie, {
			name: "P2",
			email: "peer@example.com",
		});
		expect(same.status).toBe(200);
		expect(
			(await patch("nope", rootCookie, { name: "x", email: "x@example.com" }))
				.status,
		).toBe(404);
		expect((await rotate("nope", rootCookie)).status).toBe(404);
	});

	test("customers are not reachable through the admin routes", async () => {
		await t.signedUser("customer@example.com");
		const customer = await t.db.query.user.findFirst({
			where: (u, { eq }) => eq(u.email, "customer@example.com"),
		});
		expect((await rotate(customer?.id ?? "", rootCookie)).status).toBe(404);
		expect((await del(customer?.id ?? "", rootCookie)).status).toBe(404);
	});
});

describe("admin list pagination", () => {
	const list = async (query: string) =>
		(await t.call(`/api/admins${query}`, { cookie: rootCookie })).json();

	test("pages are ordered oldest first and total counts every admin", async () => {
		await t.signedUser("customer@example.com");
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
