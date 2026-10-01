import { describe, expect, test } from "bun:test";
import { admin, json, NOW, setupAdminApp } from "../http/http.testing.ts";

describe("admin blocked ips", () => {
	test("create matches by hash but keeps the ip for the admin view; list, delete", async () => {
		const { app } = setupAdminApp();
		const created = await json(
			await app.handle(
				admin("/blocked-ips", {
					method: "POST",
					body: { ip: "1.2.3.4", reason: "abuse", expiresInHours: 2 },
				}),
			),
		);
		expect(created.item).toMatchObject({
			reason: "abuse",
			channelId: null,
			createdAt: NOW,
			expiresAt: NOW + 2 * 60 * 60 * 1000,
		});
		expect(created.item.ip).toBe("1.2.3.4");
		expect(created.item.ipHash).not.toContain("1.2.3.4");

		const list = await json(await app.handle(admin("/blocked-ips")));
		expect(list.items).toHaveLength(1);
		expect(list.total).toBe(1);
		expect(list.items[0].ip).toBe("1.2.3.4");

		const deleted = await app.handle(
			admin(`/blocked-ips/${created.item.id}`, { method: "DELETE" }),
		);
		expect(deleted.status).toBe(204);
		expect(
			(
				await app.handle(
					admin(`/blocked-ips/${created.item.id}`, { method: "DELETE" }),
				)
			).status,
		).toBe(404);
	});

	test("unknown channelId → 404; missing expiry → 422", async () => {
		const { app } = setupAdminApp();
		expect(
			(
				await app.handle(
					admin("/blocked-ips", {
						method: "POST",
						body: {
							ip: "1.1.1.1",
							channelId: "nope",
							reason: "r",
							expiresInHours: 1,
						},
					}),
				)
			).status,
		).toBe(404);
		expect(
			(
				await app.handle(
					admin("/blocked-ips", {
						method: "POST",
						body: { ip: "1.1.1.1", reason: "r" },
					}),
				)
			).status,
		).toBe(422);
	});

	test("blocked ips: newest first, paginated, total is the full count", async () => {
		const { app } = setupAdminApp();
		for (const ip of ["1.1.1.1", "2.2.2.2", "3.3.3.3"]) {
			await json(
				await app.handle(
					admin("/blocked-ips", {
						method: "POST",
						body: { ip, reason: "r", expiresInHours: 1 },
					}),
				),
			);
		}
		const page = await json(
			await app.handle(admin("/blocked-ips?pageSize=2&page=1")),
		);
		expect(page.total).toBe(3);
		expect(page.items).toHaveLength(2);
		const rest = await json(
			await app.handle(admin("/blocked-ips?pageSize=2&page=2")),
		);
		expect(rest.items).toHaveLength(1);
		const seen = [...page.items, ...rest.items].map(
			(item: { ip: string }) => item.ip,
		);
		expect(new Set(seen)).toEqual(new Set(["1.1.1.1", "2.2.2.2", "3.3.3.3"]));
	});
});
