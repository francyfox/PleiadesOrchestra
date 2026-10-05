import { describe, expect, test } from "bun:test";
import { admin, json, NOW, setupAdminApp } from "../http/http.testing.ts";

describe("admin channels", () => {
	test("create returns the secret once, list never exposes it; duplicate slug → 409", async () => {
		const { app } = setupAdminApp();
		const created = await json(
			await app.handle(
				admin("/channels", {
					method: "POST",
					body: {
						slug: "shop-foo",
						name: "Foo",
						kind: "web",
						accessMode: "open",
						allowedOrigins: ["https://foo.example"],
					},
				}),
			),
		);
		expect(created.secretKey).toStartWith("sk_");
		expect(created.channel).toMatchObject({
			slug: "shop-foo",
			kind: "web",
			allowedOrigins: ["https://foo.example"],
			disabledAt: null,
		});
		expect(created.channel.publishableKey).toStartWith("pk_");

		const list = await json(await app.handle(admin("/channels")));
		expect(list.items.map((c: { slug: string }) => c.slug)).toEqual(
			expect.arrayContaining(["telegram", "cli", "shop-foo"]),
		);
		expect(JSON.stringify(list)).not.toContain(created.secretKey);
		expect(JSON.stringify(list)).not.toContain("secretKeyHash");

		const duplicate = await app.handle(
			admin("/channels", {
				method: "POST",
				body: {
					slug: "shop-foo",
					name: "x",
					kind: "web",
					accessMode: "open",
					allowedOrigins: [],
				},
			}),
		);
		expect(duplicate.status).toBe(409);
	});

	test("patch disables a channel — its users are then denied on /v1/messages", async () => {
		const { app } = setupAdminApp();
		const patched = await json(
			await app.handle(
				admin("/channels/ch_cli", {
					method: "PATCH",
					body: { disabled: true, accessMode: "whitelist" },
				}),
			),
		);
		expect(patched.channel).toMatchObject({
			accessMode: "whitelist",
			disabledAt: NOW,
		});

		const response = await app.handle(
			new Request("http://harness.local/v1/messages", {
				method: "POST",
				headers: {
					authorization: "Bearer transport-key",
					"content-type": "application/json",
				},
				body: JSON.stringify({ threadId: "t", userId: "u", text: "hi" }),
			}),
		);
		expect(response.status).toBe(403);
	});

	test("patch leaves omitted fields alone (no enum default-filling)", async () => {
		const { app } = setupAdminApp();
		const patched = await json(
			await app.handle(
				admin("/channels/ch_cli", {
					method: "PATCH",
					body: { name: "Terminal" },
				}),
			),
		);
		expect(patched.channel).toMatchObject({
			name: "Terminal",
			accessMode: "open",
			disabledAt: null,
		});
	});

	test("rotate-keys issues a new key pair; unknown channel → 404", async () => {
		const { app } = setupAdminApp();
		const created = await json(
			await app.handle(
				admin("/channels", {
					method: "POST",
					body: {
						slug: "shop",
						name: "S",
						kind: "web",
						accessMode: "open",
						allowedOrigins: [],
					},
				}),
			),
		);
		const rotated = await json(
			await app.handle(
				admin(`/channels/${created.channel.id}/rotate-keys`, {
					method: "POST",
				}),
			),
		);
		expect(rotated.secretKey).not.toBe(created.secretKey);
		expect(rotated.channel.publishableKey).not.toBe(
			created.channel.publishableKey,
		);
		expect(
			(
				await app.handle(
					admin("/channels/nope/rotate-keys", { method: "POST" }),
				)
			).status,
		).toBe(404);
	});

	test("channels: no pageSize → everything; pageSize/page slice it; total is always the full count", async () => {
		const { app } = setupAdminApp();
		for (const slug of ["a", "b", "c"]) {
			await json(
				await app.handle(
					admin("/channels", {
						method: "POST",
						body: {
							slug,
							name: slug,
							kind: "web",
							accessMode: "open",
							allowedOrigins: [],
						},
					}),
				),
			);
		}
		const all = await json(await app.handle(admin("/channels")));
		expect(all.total).toBe(5);
		expect(all.items).toHaveLength(5);

		const first = await json(
			await app.handle(admin("/channels?pageSize=2&page=1")),
		);
		const third = await json(
			await app.handle(admin("/channels?pageSize=2&page=3")),
		);
		const beyond = await json(
			await app.handle(admin("/channels?pageSize=2&page=4")),
		);
		expect(first.total).toBe(5);
		expect(first.items).toHaveLength(2);
		expect(third.items).toHaveLength(1);
		expect(beyond.items).toEqual([]);
		const ids = [
			...first.items,
			...(await json(await app.handle(admin("/channels?pageSize=2&page=2"))))
				.items,
			...third.items,
		].map((channel: { id: string }) => channel.id);
		expect(new Set(ids).size).toBe(5);
	});

	test("channels: pageSize without page means page 1; pageSize above 100 → 422", async () => {
		const { app } = setupAdminApp();
		const page = await json(await app.handle(admin("/channels?pageSize=1")));
		expect(page.items).toHaveLength(1);
		expect((await app.handle(admin("/channels?pageSize=101"))).status).toBe(
			422,
		);
	});

	test("the language of the site's catalog: English unless said, settable on create and later, validated", async () => {
		const { app } = setupAdminApp();
		const post = (body: Record<string, unknown>) =>
			app.handle(
				admin("/channels", {
					method: "POST",
					body: {
						name: "Shop",
						kind: "web",
						accessMode: "open",
						allowedOrigins: [],
						...body,
					},
				}),
			);

		const plain = await json(await post({ slug: "plain" }));
		expect(plain.channel.catalogLanguage).toBe("en");

		const russian = await json(
			await post({ slug: "ru-shop", catalogLanguage: "ru" }),
		);
		expect(russian.channel.catalogLanguage).toBe("ru");

		const patched = await json(
			await app.handle(
				admin(`/channels/${russian.channel.id}`, {
					method: "PATCH",
					body: { catalogLanguage: "kk" },
				}),
			),
		);
		expect(patched.channel.catalogLanguage).toBe("kk");

		// A patch without it leaves it alone.
		const renamed = await json(
			await app.handle(
				admin(`/channels/${russian.channel.id}`, {
					method: "PATCH",
					body: { name: "Renamed" },
				}),
			),
		);
		expect(renamed.channel.catalogLanguage).toBe("kk");

		// A language code, not free text.
		for (const bad of ["русский", "english", "e", "EN", ""]) {
			expect((await post({ slug: "bad", catalogLanguage: bad })).status).toBe(
				422,
			);
		}
		const list = await json(await app.handle(admin("/channels")));
		expect(
			list.items.find((c: { slug: string }) => c.slug === "ru-shop")
				.catalogLanguage,
		).toBe("kk");
	});
});
