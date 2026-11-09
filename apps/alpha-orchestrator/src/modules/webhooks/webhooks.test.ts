import { describe, expect, test } from "bun:test";
import { createApp } from "../../app.ts";
import { ChannelDirectory } from "../channel-directory/channel-directory.ts";
import { createWebChannel } from "../channels/channels.service.ts";
import { testDb } from "../database/database.testing.ts";
import {
	ADMIN_KEY,
	admin,
	agent,
	decisionAgent,
	json,
	NOW,
} from "../http/http.testing.ts";
import { RunBinding } from "../run-binding/run-binding.ts";
import {
	assertPublicUrl,
	createNotifier,
	createWebhook,
	isPrivateAddress,
	UnsafeWebhookUrlError,
	updateWebhook,
} from "./webhooks.service.ts";

const publicResolve = async () => ["93.184.216.34"];

describe("SSRF guard", () => {
	test.each([
		"127.0.0.1",
		"10.1.2.3",
		"172.16.0.1",
		"192.168.1.1",
		"169.254.169.254",
		"0.0.0.0",
		"100.64.0.1",
		"::1",
		"::",
		"fe80::1",
		"fd00::1",
		"::ffff:127.0.0.1",
		"::ffff:7f00:1",
		"::ffff:169.254.169.254",
		"64:ff9b::a00:1",
	])("%s is private", (address) => {
		expect(isPrivateAddress(address)).toBe(true);
	});

	test.each(["93.184.216.34", "8.8.8.8", "2606:4700:4700::1111"])(
		"%s is public",
		(address) => {
			expect(isPrivateAddress(address)).toBe(false);
		},
	);

	test.each([
		"https://127.0.0.1/hook",
		"https://10.0.0.5/hook",
		"https://169.254.169.254/latest/meta-data",
		"https://[::1]/hook",
		"https://[::ffff:127.0.0.1]/hook",
		"https://0x7f.1/hook",
		"http://example.com/hook",
		"ftp://example.com/hook",
		"not a url",
	])("refuses %s", async (url) => {
		await expect(
			assertPublicUrl(url, { resolve: publicResolve }),
		).rejects.toBeInstanceOf(UnsafeWebhookUrlError);
	});

	test("refuses a host that resolves to a private IP, even among public ones", async () => {
		await expect(
			assertPublicUrl("https://evil.example/hook", {
				resolve: async () => ["93.184.216.34", "10.0.0.1"],
			}),
		).rejects.toBeInstanceOf(UnsafeWebhookUrlError);
	});

	test("refuses localhost and an unresolvable host", async () => {
		await expect(
			assertPublicUrl("https://localhost/hook", {
				resolve: async () => ["127.0.0.1"],
			}),
		).rejects.toBeInstanceOf(UnsafeWebhookUrlError);
		await expect(
			assertPublicUrl("https://nope.example/hook", {
				resolve: async () => {
					throw new Error("ENOTFOUND");
				},
			}),
		).rejects.toBeInstanceOf(UnsafeWebhookUrlError);
	});

	test("accepts a public https host; allowPrivate opens dev targets", async () => {
		const url = await assertPublicUrl("https://hooks.example/x", {
			resolve: publicResolve,
		});
		expect(url.hostname).toBe("hooks.example");
		await expect(
			assertPublicUrl("http://localhost:9000/x", { allowPrivate: true }),
		).resolves.toBeInstanceOf(URL);
	});
});

function setup(responses: (Response | Error)[] = [new Response("ok")]) {
	const db = testDb();
	const calls: { url: string; init: RequestInit }[] = [];
	const fetchFn = (async (url: URL | string, init: RequestInit) => {
		calls.push({ url: String(url), init });
		const step = responses[Math.min(calls.length, responses.length) - 1];
		if (step instanceof Error) throw step;
		return step?.clone() ?? new Response("ok");
	}) as unknown as typeof fetch;
	const notifier = createNotifier({
		db,
		fetch: fetchFn,
		resolve: publicResolve,
		now: () => NOW,
		sleep: async () => {},
	});
	return { db, calls, notifier };
}

describe("notifier", () => {
	test("delivers only to enabled webhooks subscribed to the event, signed", async () => {
		const { db, calls, notifier } = setup();
		const hook = createWebhook(
			db,
			{ url: "https://a.example/h", events: ["run.failed"] },
			NOW,
		);
		createWebhook(
			db,
			{ url: "https://b.example/h", events: ["ip.blocked"] },
			NOW,
		);
		const off = createWebhook(
			db,
			{ url: "https://c.example/h", events: ["run.failed"] },
			NOW,
		);
		updateWebhook(db, off.id, { enabled: false });

		await notifier.emit("run.failed", {
			runId: "r1",
			threadId: "t1",
			channelId: null,
		});

		expect(calls).toHaveLength(1);
		expect(calls[0]?.url).toBe("https://a.example/h");
		const body = String(calls[0]?.init.body);
		expect(JSON.parse(body)).toMatchObject({
			event: "run.failed",
			at: NOW,
			data: { runId: "r1", threadId: "t1", channelId: null },
		});
		const headers = calls[0]?.init.headers as Record<string, string>;
		expect(headers["x-pleiades-event"]).toBe("run.failed");
		const expected = new Bun.CryptoHasher("sha256", hook.secret)
			.update(body)
			.digest("hex");
		expect(headers["x-pleiades-signature"]).toBe(`sha256=${expected}`);
		expect(calls[0]?.init.redirect).toBe("manual");
	});

	test("discord, slack and telegram get a short text in their own field, unsigned; json stays the full signed event", async () => {
		const { db, calls, notifier } = setup();
		const url = (name: string) => `https://${name}.example/h`;
		for (const format of ["discord", "slack", "telegram", "json"] as const) {
			createWebhook(
				db,
				{
					url: url(format),
					events: ["balance.depleted"],
					format,
					ownerId: "a",
				},
				NOW,
			);
		}
		await notifier.emit("balance.depleted", {
			accountId: "a",
			balanceUsd: -0.5,
			channels: ["c1", "c2"],
		});
		const sent = Object.fromEntries(
			calls.map((c) => [c.url, JSON.parse(String(c.init.body))]),
		);
		const text = sent[url("slack")].text;
		expect(text).toContain("channels");
		expect(sent[url("discord")]).toEqual({ content: text });
		expect(sent[url("telegram")]).toEqual({ text });
		expect(sent[url("json")]).toMatchObject({ event: "balance.depleted" });
		const headers = (name: string) =>
			calls.find((c) => c.url === url(name))?.init.headers as Record<
				string,
				string
			>;
		expect(headers("discord")["x-pleiades-signature"]).toBeUndefined();
		expect(headers("json")["x-pleiades-signature"]).toBeDefined();
	});

	test("retries a 500 up to 3 attempts and records the outcome", async () => {
		const { db, calls, notifier } = setup([new Response("x", { status: 500 })]);
		const hook = createWebhook(
			db,
			{ url: "https://a.example/h", events: ["run.failed"] },
			NOW,
		);
		const result = await notifier.send(hook, "run.failed", {
			runId: "r",
			threadId: "t",
			channelId: null,
		});
		expect(calls).toHaveLength(3);
		expect(result).toEqual({ status: 500, error: "HTTP 500" });
		const row = (await import("./webhooks.service.ts")).getWebhook(db, hook.id);
		expect(row).toMatchObject({
			lastStatus: 500,
			lastError: "HTTP 500",
			lastAt: NOW,
		});
	});

	test("a 404 or a redirect is not retried; a network error is, and never throws", async () => {
		const redirect = setup([new Response(null, { status: 302 })]);
		const hook = createWebhook(
			redirect.db,
			{ url: "https://a.example/h", events: ["run.failed"] },
			NOW,
		);
		await redirect.notifier.emit("run.failed", {
			runId: "r",
			threadId: "t",
			channelId: null,
		});
		expect(redirect.calls).toHaveLength(1);

		const down = setup([new Error("ECONNREFUSED")]);
		const h2 = createWebhook(
			down.db,
			{ url: "https://a.example/h", events: ["run.failed"] },
			NOW,
		);
		const result = await down.notifier.send(h2, "run.failed", {
			runId: "r",
			threadId: "t",
			channelId: null,
		});
		expect(down.calls).toHaveLength(3);
		expect(result.error).toBe("ECONNREFUSED");
		expect(hook.id).not.toBe(h2.id);
	});

	test("re-checks the address on delivery: a hook pointing at a private IP is never called", async () => {
		const { db, calls } = setup();
		const notifier = createNotifier({
			db,
			fetch: (async () => new Response("ok")) as unknown as typeof fetch,
			resolve: async () => ["10.0.0.1"],
			sleep: async () => {},
		});
		const hook = createWebhook(
			db,
			{ url: "https://rebind.example/h", events: ["run.failed"] },
			NOW,
		);
		const result = await notifier.send(hook, "run.failed", {
			runId: "r",
			threadId: "t",
			channelId: null,
		});
		expect(result.status).toBeNull();
		expect(calls).toHaveLength(0);
	});
});

describe("admin webhook routes", () => {
	function appWith(responses?: (Response | Error)[]) {
		const db = testDb();
		const calls: string[] = [];
		const app = createApp({
			agent,
			decisionAgent,
			apiKey: "transport-key",
			adminApiKey: ADMIN_KEY,
			maxChunkChars: 100,
			db,
			channels: new ChannelDirectory(db),
			runs: new RunBinding(),
			ipHashSalt: "salt",
			now: () => NOW,
			webhooks: {
				resolve: publicResolve,
				sleep: async () => {},
				fetch: (async (url: URL | string) => {
					calls.push(String(url));
					const r = responses?.[0];
					if (r instanceof Error) throw r;
					return r?.clone() ?? new Response("ok");
				}) as unknown as typeof fetch,
			},
		});
		return { app, calls };
	}

	test("create shows the secret once; list hides it; update, test, rotate, delete", async () => {
		const { app, calls } = appWith();
		const created = await json(
			await app.handle(
				admin("/webhooks", {
					method: "POST",
					body: {
						name: "n",
						url: "https://hooks.example/x",
						events: ["ip.blocked"],
					},
				}),
			),
		);
		expect(created.secret).toStartWith("whsec_");
		expect(created.item.secret).toBeUndefined();

		const list = await json(await app.handle(admin("/webhooks")));
		expect(list.items).toHaveLength(1);
		expect(list.items[0].secret).toBeUndefined();
		expect(list.events.map((e: { name: string }) => e.name)).toContain(
			"run.failed",
		);

		const patched = await json(
			await app.handle(
				admin(`/webhooks/${created.item.id}`, {
					method: "PATCH",
					body: { enabled: false, events: ["run.failed"] },
				}),
			),
		);
		expect(patched.item).toMatchObject({
			enabled: false,
			events: ["run.failed"],
		});

		const tested = await json(
			await app.handle(
				admin(`/webhooks/${created.item.id}/test`, { method: "POST" }),
			),
		);
		expect(tested).toEqual({ status: 200, error: null });
		expect(calls).toEqual(["https://hooks.example/x"]);

		const rotated = await json(
			await app.handle(
				admin(`/webhooks/${created.item.id}/secret`, { method: "POST" }),
			),
		);
		expect(rotated.secret).not.toBe(created.secret);

		expect(
			(
				await app.handle(
					admin(`/webhooks/${created.item.id}`, { method: "DELETE" }),
				)
			).status,
		).toBe(204);
		expect(
			(
				await app.handle(
					admin(`/webhooks/${created.item.id}`, { method: "DELETE" }),
				)
			).status,
		).toBe(404);
	});

	test("refuses private URLs and unknown events", async () => {
		const { app } = appWith();
		const post = (url: string, events: string[]) =>
			app.handle(
				admin("/webhooks", {
					method: "POST",
					body: { name: "n", url, events },
				}),
			);
		expect((await post("https://10.0.0.1/x", ["run.failed"])).status).toBe(400);
		expect((await post("https://hooks.example/x", ["nope"])).status).toBe(422);
	});

	test("a name is required; PATCH edits name, url, type and events, with the same URL checks as create", async () => {
		const { app } = appWith();
		const post = (body: object) =>
			app.handle(admin("/webhooks", { method: "POST", body }));
		const base = { url: "https://hooks.example/x", events: ["run.failed"] };
		expect((await post(base)).status).toBe(422);
		expect((await post({ ...base, name: "" })).status).toBe(422);
		const created = await json(await post({ ...base, name: "Ops chat" }));
		expect(created.item.name).toBe("Ops chat");
		expect(created.item.format).toBe("json");

		const patch = (body: object) =>
			app.handle(
				admin(`/webhooks/${created.item.id}`, { method: "PATCH", body }),
			);
		const edited = await json(
			await patch({
				name: "Discord ops",
				url: "https://discord.example/hook",
				format: "discord",
				events: ["run.failed", "ip.blocked"],
			}),
		);
		expect(edited.item).toMatchObject({
			name: "Discord ops",
			url: "https://discord.example/hook",
			format: "discord",
			events: ["run.failed", "ip.blocked"],
		});
		expect((await patch({ url: "https://10.0.0.1/x" })).status).toBe(400);
		expect((await patch({ name: "" })).status).toBe(422);
	});

	test("blocking an IP emits ip.blocked to subscribers", async () => {
		const { app, calls } = appWith();
		await app.handle(
			admin("/webhooks", {
				method: "POST",
				body: {
					name: "n",
					url: "https://hooks.example/x",
					events: ["ip.blocked"],
				},
			}),
		);
		await app.handle(
			admin("/blocked-ips", {
				method: "POST",
				body: { ip: "1.2.3.4", reason: "abuse", expiresInHours: 1 },
			}),
		);
		await Bun.sleep(10);
		expect(calls).toEqual(["https://hooks.example/x"]);
	});
});

describe("webhooks per owner", () => {
	function channelOf(
		db: ReturnType<typeof testDb>,
		slug: string,
		ownerId?: string,
	) {
		return createWebChannel(
			db,
			{ slug, name: slug, accessMode: "open", allowedOrigins: [], ownerId },
			NOW,
		).channel.id;
	}

	test("a channel event reaches its owner's webhook and the staff ones, nobody else's", async () => {
		const { db, calls, notifier } = setup();
		const mine = channelOf(db, "mine", "alice");
		const subscribe = (url: string, ownerId?: string) =>
			createWebhook(db, { url, events: ["run.failed"], ownerId }, NOW);
		subscribe("https://alice.example/h", "alice");
		subscribe("https://bob.example/h", "bob");
		subscribe("https://staff.example/h");

		await notifier.emit("run.failed", {
			runId: "r",
			threadId: "t",
			channelId: mine,
		});
		expect(calls.map((c) => c.url).sort()).toEqual([
			"https://alice.example/h",
			"https://staff.example/h",
		]);
	});

	test("a staff-only event reaches staff webhooks only; a balance event its account only, never staff", async () => {
		const { db, calls, notifier } = setup();
		createWebhook(
			db,
			{
				url: "https://alice.example/h",
				events: ["balance.depleted"],
				ownerId: "alice",
			},
			NOW,
		);
		createWebhook(
			db,
			{ url: "https://staff.example/h", events: ["ip.blocked"] },
			NOW,
		);
		await notifier.emit("ip.blocked", {
			ip: "1.1.1.1",
			channelId: null,
			reason: "r",
			expiresAt: 1,
		});
		expect(calls.map((c) => c.url)).toEqual(["https://staff.example/h"]);
		calls.length = 0;
		await notifier.emit("balance.depleted", {
			accountId: "alice",
			balanceUsd: -1,
			channels: [],
		});
		expect(calls.map((c) => c.url)).toEqual(["https://alice.example/h"]);
	});

	test("staff cannot subscribe to balance events, they exist for owners only", () => {
		const { db } = setup();
		const url = "https://staff.example/h";
		for (const event of ["balance.low", "balance.depleted"] as const) {
			expect(() => createWebhook(db, { url, events: [event] }, NOW)).toThrow();
			expect(() =>
				createWebhook(db, { url, events: [event], ownerId: "alice" }, NOW),
			).not.toThrow();
		}
	});

	test("a customer's webhook never gets the dev allowance for private targets", async () => {
		const db = testDb();
		const calls: string[] = [];
		const notifier = createNotifier({
			db,
			allowPrivate: true,
			fetch: (async (url: URL) => {
				calls.push(String(url));
				return new Response("ok");
			}) as unknown as typeof fetch,
			resolve: async () => ["127.0.0.1"],
			sleep: async () => {},
		});
		const mine = createWebhook(
			db,
			{
				url: "http://localhost:9000/h",
				events: ["webhook.test"],
				ownerId: "alice",
			},
			NOW,
		);
		const staff = createWebhook(
			db,
			{ url: "http://localhost:9000/h", events: ["webhook.test"] },
			NOW,
		);
		const data = { message: "m" };
		expect((await notifier.send(mine, "webhook.test", data)).status).toBeNull();
		expect((await notifier.send(staff, "webhook.test", data)).status).toBe(200);
		expect(calls).toHaveLength(1);
	});

	function api() {
		const db = testDb();
		const app = createApp({
			agent,
			decisionAgent,
			apiKey: "transport-key",
			adminApiKey: ADMIN_KEY,
			maxChunkChars: 100,
			db,
			channels: new ChannelDirectory(db),
			runs: new RunBinding(),
			ipHashSalt: "salt",
			now: () => NOW,
			webhooks: {
				resolve: publicResolve,
				sleep: async () => {},
				fetch: (async () => new Response("ok")) as unknown as typeof fetch,
			},
		});
		return app;
	}

	test("a customer cannot read or change another customer's webhook (404), staff can", async () => {
		const app = api();
		const created = await json(
			await app.handle(
				admin("/webhooks", {
					method: "POST",
					body: {
						name: "n",
						url: "https://a.example/h",
						events: ["run.failed"],
						ownerId: "alice",
					},
				}),
			),
		);
		const id = created.item.id;
		const asBob = (path: string, method = "GET", body?: unknown) =>
			app.handle(admin(`/webhooks${path}?ownerId=bob`, { method, body }));

		expect((await json(await asBob(""))).items).toHaveLength(0);
		expect((await asBob(`/${id}`, "PATCH", { enabled: false })).status).toBe(
			404,
		);
		expect((await asBob(`/${id}/secret`, "POST")).status).toBe(404);
		expect((await asBob(`/${id}/test`, "POST")).status).toBe(404);
		expect((await asBob(`/${id}`, "DELETE")).status).toBe(404);

		const asAlice = await json(
			await app.handle(admin("/webhooks?ownerId=alice")),
		);
		expect(asAlice.items).toHaveLength(1);
		expect(asAlice.items[0].enabled).toBe(true);
		expect(
			(await json(await app.handle(admin("/webhooks")))).items,
		).toHaveLength(1);
	});

	test("a customer cannot subscribe to a staff-only event, create or update", async () => {
		const app = api();
		const bad = await app.handle(
			admin("/webhooks", {
				method: "POST",
				body: {
					name: "n",
					url: "https://a.example/h",
					events: ["ip.blocked"],
					ownerId: "bob",
				},
			}),
		);
		expect(bad.status).toBe(400);
		const ok = await json(
			await app.handle(
				admin("/webhooks", {
					method: "POST",
					body: {
						name: "n",
						url: "https://a.example/h",
						events: ["run.failed"],
						ownerId: "bob",
					},
				}),
			),
		);
		const patch = await app.handle(
			admin(`/webhooks/${ok.item.id}?ownerId=bob`, {
				method: "PATCH",
				body: { events: ["ip.blocked"] },
			}),
		);
		expect(patch.status).toBe(400);
	});

	test("a customer is limited to 5 webhooks and the catalog marks scopes", async () => {
		const app = api();
		const make = (n: number) =>
			app.handle(
				admin("/webhooks", {
					method: "POST",
					body: {
						name: "n",
						url: `https://a.example/${n}`,
						events: ["run.failed"],
						ownerId: "alice",
					},
				}),
			);
		for (let n = 0; n < 5; n++) expect((await make(n)).status).toBe(200);
		expect((await make(5)).status).toBe(400);
		const list = await json(await app.handle(admin("/webhooks?ownerId=bob")));
		expect(list.events).toContainEqual({
			name: "run.failed",
			scope: "customer",
		});
		expect(list.events).toContainEqual({
			name: "balance.low",
			scope: "owner",
		});
	});
});
