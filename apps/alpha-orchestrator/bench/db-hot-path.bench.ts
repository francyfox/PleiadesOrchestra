// Not part of `bun test`: bun bench/db-hot-path.bench.ts

import { isIpBlocked } from "../src/modules/blocked-ips/blocked-ips.service.ts";
import { createWebChannel } from "../src/modules/channels/channels.service.ts";
import { testDb } from "../src/modules/database/database.testing.ts";
import {
	createVisitor,
	findVisitor,
	touchVisitor,
} from "../src/modules/visitors/visitors.service.ts";

const db = testDb();
const ch = createWebChannel(
	db,
	{ slug: "b", name: "b", accessMode: "open", allowedOrigins: [] },
	1,
).channel.id;
const v = createVisitor(db, ch, 1000, 86_400_000, "1.1.1.1");
const N = 50_000;
function time(name: string, fn: (i: number) => void) {
	for (let i = 0; i < 2000; i++) fn(i);
	const t = performance.now();
	for (let i = 0; i < N; i++) fn(i);
	console.log(
		name.padEnd(28),
		(((performance.now() - t) * 1000) / N).toFixed(2),
		"us/op",
	);
}
time("findVisitor (prepared)", () => findVisitor(db, v.visitorToken, 2000));
time("isIpBlocked (prepared)", () => isIpBlocked(db, "h", ch, 2000));
const vis = findVisitor(db, v.visitorToken, 2000);
if (!vis) throw new Error("no visitor");
time("touchVisitor (coalesced)", (i) =>
	touchVisitor(db, vis, 2000 + (i % 50), 86_400_000, "1.1.1.1"),
);
let t = 2000;
time("touchVisitor (always write)", () => {
	t += 61_000;
	touchVisitor(db, vis, t, 86_400_000, "1.1.1.1");
});
