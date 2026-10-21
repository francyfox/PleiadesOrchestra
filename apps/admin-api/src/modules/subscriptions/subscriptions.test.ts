import { describe, expect, test } from "bun:test";
import {
	call,
	json,
	setRespond,
	signedIn,
	upstream,
	useHarness,
} from "../../app.harness.testing.ts";

useHarness();

const SUBSCRIPTION = {
	id: "sub_1",
	customerId: "cus_1",
	customerEmail: "owner@shop.example",
	plan: "Cloud",
	status: "canceling",
	startedAt: 1,
	currentPeriodEnd: 2,
	endedAt: null,
	accountId: "acc_1",
	polarUrl: "https://polar.sh/x/sub_1",
};

describe("subscriptions (proxied)", () => {
	test("the list forwards the filters and adds the account email", async () => {
		const cookie = await signedIn();
		setRespond(() => json({ items: [SUBSCRIPTION] }));
		const list = await call(
			"/api/subscriptions?status=canceling&accountId=acc_1",
			{ cookie },
		);
		const [item] = (await list.json()).items;
		expect(item).toMatchObject({ id: "sub_1", accountEmail: null });
		expect(upstream[0]?.url).toBe(
			"http://orchestrator/v1/admin/subscriptions?status=canceling&accountId=acc_1",
		);
	});

	test("the channel link route is gone", async () => {
		const cookie = await signedIn();
		const linked = await call("/api/subscriptions/sub_1/channel", {
			method: "PUT",
			cookie,
			body: { channelId: "c1" },
		});
		expect(linked.status).toBe(404);
	});

	test("signed out is refused", async () => {
		expect((await call("/api/subscriptions")).status).toBe(401);
	});
});
