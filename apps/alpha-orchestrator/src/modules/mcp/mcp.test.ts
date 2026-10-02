import { describe, expect, test } from "bun:test";
import { createWebChannel } from "../channels/channels.service.ts";
import { testDb } from "../database/database.testing.ts";
import { hashTools, listMcpSites, recordCatalog } from "./mcp.service.ts";

const search = {
	name: "search_products",
	description: "Search the catalog",
	inputSchema: {
		type: "object" as const,
		properties: { query: { type: "string" } },
		required: ["query"],
	},
};
const cart = { name: "get_cart", description: "Show the cart" };

function setup() {
	const db = testDb();
	const channel = createWebChannel(
		db,
		{
			slug: "shop",
			name: "Shop",
			accessMode: "open",
			allowedOrigins: ["http://localhost:5173"],
		},
		1,
	).channel;
	return { db, channel };
}

describe("hashTools", () => {
	test("does not depend on tool order or key order", () => {
		const reordered = {
			inputSchema: {
				required: ["query"],
				properties: { query: { type: "string" } },
				type: "object" as const,
			},
			description: "Search the catalog",
			name: "search_products",
		};
		expect(hashTools([search, cart])).toBe(hashTools([cart, reordered]));
	});

	test("changes when anything a planner reads changes", () => {
		const base = hashTools([search]);
		expect(hashTools([{ ...search, description: "Find things" }])).not.toBe(
			base,
		);
		expect(hashTools([search, cart])).not.toBe(base);
	});
});

describe("recordCatalog", () => {
	test("the same tools announced again only bump the counters", () => {
		const { db, channel } = setup();
		recordCatalog(db, channel.id, [search, cart], 100);
		recordCatalog(db, channel.id, [cart, search], 200);

		const sites = listMcpSites(db);
		expect(sites).toHaveLength(1);
		expect(sites[0]).toMatchObject({
			channelId: channel.id,
			channelSlug: "shop",
			channelName: "Shop",
			toolCount: 2,
			firstSeenAt: 100,
			lastSeenAt: 200,
			registrations: 2,
			versions: 1,
		});
	});

	test("changed tools are a new version; the list shows the newest", () => {
		const { db, channel } = setup();
		recordCatalog(db, channel.id, [search], 100);
		recordCatalog(db, channel.id, [search, cart], 300);

		const [site] = listMcpSites(db);
		expect(site?.versions).toBe(2);
		expect(site?.tools.map((tool) => tool.name).sort()).toEqual([
			"get_cart",
			"search_products",
		]);
		expect(site?.firstSeenAt).toBe(300);
	});

	test("only the latest 5 versions of a channel are kept", () => {
		const { db, channel } = setup();
		for (let i = 0; i < 8; i++) {
			recordCatalog(db, channel.id, [{ name: `tool_${i}` }], 100 + i);
		}
		expect(listMcpSites(db)[0]?.versions).toBe(5);
	});

	test("an empty catalog is not worth a row", () => {
		const { db, channel } = setup();
		recordCatalog(db, channel.id, [], 100);
		expect(listMcpSites(db)).toEqual([]);
	});

	test("channels without a catalog are not listed", () => {
		const { db } = setup();
		expect(listMcpSites(db)).toEqual([]);
	});
});

describe("admin route", () => {
	test("GET /mcp lists what the channels announced", async () => {
		const { admin, json, setupAdminApp } = await import(
			"../http/http.testing.ts"
		);
		const { app, db } = setupAdminApp();
		const channel = createWebChannel(
			db,
			{ slug: "shop", name: "Shop", accessMode: "open", allowedOrigins: [] },
			1,
		).channel;
		recordCatalog(db, channel.id, [search], 10);

		const body = await json(await app.handle(admin("/mcp")));
		expect(body.items).toHaveLength(1);
		expect(body.items[0]).toMatchObject({ channelSlug: "shop", toolCount: 1 });
		expect(body.items[0].tools[0].name).toBe("search_products");
	});
});
