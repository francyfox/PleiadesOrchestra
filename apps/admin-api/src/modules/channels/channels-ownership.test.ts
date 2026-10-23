import { describe, expect, test } from "bun:test";
import { fakeOrchestrator, testApp } from "../../app.testing.ts";

const channel = (id: string, ownerId: string | null) => ({
	id,
	slug: id,
	name: id,
	kind: "web",
	accessMode: "open",
	allowedOrigins: [],
	catalogLanguage: "en",
	intentSets: [],
	publishableKey: "pk",
	disabledAt: null,
	createdAt: 1,
	ownerId,
});

/** Owners are looked up by email once the accounts exist; the fake orchestrator reads them lazily. */
function setup() {
	const owners: Record<string, string> = {};
	const fake = fakeOrchestrator((call) => {
		const url = new URL(call.path, "http://x");
		if (call.method === "GET" && url.pathname === "/v1/admin/channels") {
			const ownerId = url.searchParams.get("ownerId");
			const all = [
				channel("mine", owners.ann ?? null),
				channel("theirs", owners.bob ?? null),
				channel("staff-one", null),
			];
			const items = ownerId ? all.filter((c) => c.ownerId === ownerId) : all;
			return Response.json({ items, total: items.length });
		}
		if (call.method === "POST" && url.pathname === "/v1/admin/channels") {
			const body = call.body as { ownerId?: string };
			return Response.json({
				channel: channel("new", body.ownerId ?? null),
				secretKey: "sk",
			});
		}
		if (url.pathname.endsWith("/persona")) {
			const persona = {
				botName: "",
				tone: "",
				instructions: "",
				defaultLang: "",
				greeting: "",
				forbiddenTopics: [],
				handoffContact: "",
			};
			return Response.json({
				persona,
				defaults: persona,
				prompt: "p",
				fixed: "f",
			});
		}
		if (url.pathname.endsWith("/rotate-keys")) {
			return Response.json({
				channel: channel("mine", owners.ann ?? null),
				secretKey: "sk2",
			});
		}
		return Response.json({ channel: channel("mine", owners.ann ?? null) });
	});
	const t = testApp({ orchestrator: fake.client });
	return { t, calls: fake.calls, owners };
}

async function users() {
	const s = setup();
	const ann = await s.t.signedUser("ann@example.com");
	const bob = await s.t.signedUser("bob@example.com");
	const rows = await s.t.db.query.user.findMany();
	for (const row of rows) s.owners[row.email.split("@")[0] as string] = row.id;
	const staff = await s.t.registerFirst();
	return { ...s, ann, bob, staff };
}

const writes = (calls: { method: string }[]) =>
	calls.filter((c) => c.method !== "GET");

describe("channels: a user sees and edits only their own", () => {
	test("list is forced to the session's owner; a client ownerId is ignored", async () => {
		const { t, calls, ann, owners } = await users();
		const response = await t.call(`/api/channels?ownerId=${owners.bob}`, {
			cookie: ann,
		});
		expect(response.status).toBe(200);
		expect(
			(await response.json()).items.map((c: { id: string }) => c.id),
		).toEqual(["mine"]);
		expect(calls.at(-1)?.path).toContain(`ownerId=${owners.ann}`);
		expect(calls.at(-1)?.path).not.toContain(owners.bob as string);
	});

	test("create: ownerId in the body is ignored for a user, honoured for staff", async () => {
		const { t, calls, ann, staff, owners } = await users();
		const body = { slug: "shop", name: "Shop", ownerId: owners.bob };
		await t.call("/api/channels", { method: "POST", cookie: ann, body });
		expect(calls.at(-1)?.body).toMatchObject({ ownerId: owners.ann });

		await t.call("/api/channels", { method: "POST", cookie: staff, body });
		expect(calls.at(-1)?.body).toMatchObject({ ownerId: owners.bob });

		await t.call("/api/channels", {
			method: "POST",
			cookie: staff,
			body: { slug: "own", name: "Own" },
		});
		expect(calls.at(-1)?.body).not.toHaveProperty("ownerId");
	});

	test("reading, patching, rotating or editing the persona of another owner's channel is 404 and never reaches the orchestrator", async () => {
		const { t, calls, ann } = await users();
		const persona = {
			botName: "b",
			tone: "",
			instructions: "",
			defaultLang: "",
			greeting: "",
			forbiddenTopics: [],
			handoffContact: "",
		};
		const attempts: [string, string, unknown?][] = [
			["PATCH", "/api/channels/theirs", { name: "x" }],
			["POST", "/api/channels/theirs/rotate-keys"],
			["GET", "/api/channels/theirs/persona"],
			["PUT", "/api/channels/theirs/persona", persona],
			["POST", "/api/channels/theirs/persona/preview", persona],
			// a staff-owned channel is not theirs either
			["PATCH", "/api/channels/staff-one", { name: "x" }],
			["GET", "/api/channels/nope/persona"],
		];
		for (const [method, path, body] of attempts) {
			const response = await t.call(path, { method, cookie: ann, body });
			expect([method, path, response.status]).toEqual([method, path, 404]);
			expect(await response.json()).toEqual({ error: "not_found" });
		}
		expect(writes(calls)).toHaveLength(0);
		expect(calls.every((c) => c.path.includes(`ownerId=`))).toBe(true);
	});

	test("the same routes work on their own channel", async () => {
		const { t, calls, ann } = await users();
		const patched = await t.call("/api/channels/mine", {
			method: "PATCH",
			cookie: ann,
			body: { name: "New" },
		});
		expect(patched.status).toBe(200);
		expect(
			(
				await t.call("/api/channels/mine/rotate-keys", {
					method: "POST",
					cookie: ann,
				})
			).status,
		).toBe(200);
		expect(
			(await t.call("/api/channels/mine/persona", { cookie: ann })).status,
		).toBe(200);
		expect(writes(calls).map((c) => c.method)).toEqual(["PATCH", "POST"]);
	});

	test("staff reach any channel without an ownership lookup and may filter by owner", async () => {
		const { t, calls, staff, owners } = await users();
		const before = calls.length;
		const patched = await t.call("/api/channels/theirs", {
			method: "PATCH",
			cookie: staff,
			body: { name: "x" },
		});
		expect(patched.status).toBe(200);
		expect(calls.slice(before).map((c) => c.method)).toEqual(["PATCH"]);

		const all = await (await t.call("/api/channels", { cookie: staff })).json();
		expect(all.items).toHaveLength(3);
		const filtered = await (
			await t.call(`/api/channels?ownerId=${owners.bob}`, { cookie: staff })
		).json();
		expect(filtered.items.map((c: { id: string }) => c.id)).toEqual(["theirs"]);
	});

	test("without a session every channel route is 401", async () => {
		const { t } = await users();
		expect((await t.call("/api/channels")).status).toBe(401);
		expect(
			(await t.call("/api/channels/mine", { method: "PATCH", body: {} }))
				.status,
		).toBe(401);
	});
});

describe("dashboard is scoped to the owner", () => {
	test("a user's numbers carry their own ownerId whatever the query says; staff may choose", async () => {
		const { t, calls, ann, staff, owners } = await users();
		await t.call(`/api/dashboard?ownerId=${owners.bob}`, { cookie: ann });
		const mine = calls.filter((c) => /\/(stats|usage)/.test(c.path));
		expect(mine).toHaveLength(5);
		for (const call of mine) {
			expect(call.path).toContain(`ownerId=${owners.ann}`);
			expect(call.path).not.toContain(owners.bob as string);
		}

		calls.length = 0;
		await t.call("/api/dashboard", { cookie: staff });
		expect(calls.some((c) => c.path.includes("ownerId"))).toBe(false);
		calls.length = 0;
		await t.call(`/api/dashboard?ownerId=${owners.bob}`, { cookie: staff });
		expect(calls.every((c) => c.path.includes(`ownerId=${owners.bob}`))).toBe(
			true,
		);
	});
});
