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
	channelId: null,
	channelName: null,
	polarUrl: "https://polar.sh/x/sub_1",
};

describe("subscriptions (proxied)", () => {
	test("the list forwards the status filter and the link goes upstream with the admin id", async () => {
		const cookie = await signedIn();
		setRespond(() => json({ items: [SUBSCRIPTION] }));
		const list = await call("/api/subscriptions?status=canceling", { cookie });
		expect((await list.json()).items[0].id).toBe("sub_1");
		expect(upstream[0]?.url).toBe(
			"http://orchestrator/v1/admin/subscriptions?status=canceling",
		);

		setRespond(() =>
			json({ ...SUBSCRIPTION, channelId: "c1", channelName: "Shop" }),
		);
		const linked = await call("/api/subscriptions/sub_1/channel", {
			method: "PUT",
			cookie,
			body: { channelId: "c1" },
		});
		expect(linked.status).toBe(200);
		expect(upstream[1]?.method).toBe("PUT");
		expect(upstream[1]?.body).toEqual({ channelId: "c1" });
	});

	test("signed out is refused", async () => {
		expect((await call("/api/subscriptions")).status).toBe(401);
	});
});
