import { describe, expect, test } from "bun:test";
import {
	createWebChannel,
	updateChannel,
} from "../channels/channels.service.ts";
import { testDb } from "../database/database.testing.ts";
import { ChannelDirectory } from "./channel-directory.ts";

function setup() {
	const db = testDb();
	const { channel, secretKey } = createWebChannel(
		db,
		{
			slug: "shop",
			name: "Shop",
			accessMode: "open",
			allowedOrigins: ["https://shop.example"],
		},
		1,
	);
	return { db, directory: new ChannelDirectory(db), channel, secretKey };
}

describe("ChannelDirectory", () => {
	test("finds channels by slug, id and publishable key", () => {
		const { directory, channel } = setup();
		expect(directory.bySlug("shop")?.id).toBe(channel.id);
		expect(directory.byId(channel.id)?.slug).toBe("shop");
		expect(
			directory.byPublishableKey(channel.publishableKey as string)?.id,
		).toBe(channel.id);
		expect(directory.bySlug("nope")).toBeUndefined();
	});

	test("only web channels are found by publishable key", () => {
		const { directory } = setup();
		expect(directory.byPublishableKey("")).toBeUndefined();
		expect(directory.bySlug("telegram")?.kind).toBe("telegram");
	});

	test("isWebOrigin is true only for enabled web channels", () => {
		const { db, directory, channel } = setup();
		expect(directory.isWebOrigin("https://shop.example")).toBe(true);
		expect(directory.isWebOrigin("https://evil.example")).toBe(false);

		updateChannel(db, channel.id, { disabled: true }, 2);
		directory.invalidate();
		expect(directory.isWebOrigin("https://shop.example")).toBe(false);
	});

	test("serves a stale view until invalidated", () => {
		const { db, directory, channel } = setup();
		directory.bySlug("shop");
		updateChannel(db, channel.id, { name: "Renamed" }, 2);
		expect(directory.bySlug("shop")?.name).toBe("Shop");
		directory.invalidate();
		expect(directory.bySlug("shop")?.name).toBe("Renamed");
	});
});
