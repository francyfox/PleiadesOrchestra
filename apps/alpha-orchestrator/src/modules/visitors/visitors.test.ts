import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { createWebChannel } from "../channels/channels.service.ts";
import { users, visitorTokens } from "../database/database.schema.ts";
import { testDb } from "../database/database.testing.ts";
import {
	createVisitor,
	findVisitor,
	TOUCH_COALESCE_MS,
	touchVisitor,
} from "./visitors.service.ts";

const TTL = 24 * 3600_000;

function setup() {
	const db = testDb();
	const t0 = 1_000_000;
	const channelId = createWebChannel(
		db,
		{ slug: "shop", name: "Shop", accessMode: "open", allowedOrigins: [] },
		t0,
	).channel.id;
	const created = createVisitor(db, channelId, t0, TTL, "1.1.1.1");
	const visitor = findVisitor(db, created.visitorToken, t0 + 1);
	if (!visitor) throw new Error("visitor not found");
	return { db, visitor, t0, userId: created.userId };
}

const lastSeen = (db: ReturnType<typeof testDb>, id: string) =>
	db.select().from(users).where(eq(users.id, id)).get()?.lastSeenAt;

test("touchVisitor skips writes inside the coalesce window", () => {
	const { db, visitor, t0, userId } = setup();
	const touched = touchVisitor(db, visitor, t0 + 1000, TTL, "1.1.1.1");
	expect(lastSeen(db, userId)).toBe(t0);
	expect(touched.user.id).toBe(userId);
});

test("touchVisitor writes once the window passed, sliding the token expiry", () => {
	const { db, visitor, t0, userId } = setup();
	const at = t0 + TOUCH_COALESCE_MS + 1;
	touchVisitor(db, visitor, at, TTL, "1.1.1.1");
	expect(lastSeen(db, userId)).toBe(at);
	const token = db.select().from(visitorTokens).get();
	expect(token?.expiresAt).toBe(at + TTL);
});

test("touchVisitor writes immediately when the IP changed", () => {
	const { db, visitor, t0, userId } = setup();
	touchVisitor(db, visitor, t0 + 10, TTL, "2.2.2.2");
	expect(lastSeen(db, userId)).toBe(t0 + 10);
	expect(db.select().from(users).get()?.lastIp).toBe("2.2.2.2");
});
