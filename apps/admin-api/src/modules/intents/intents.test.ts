import { describe, expect, test } from "bun:test";
import {
	call,
	setRespond,
	signedIn,
	upstream,
	useHarness,
} from "../../app.harness.testing.ts";

useHarness();

const EXAMPLE = {
	id: "e1",
	channelId: "c1",
	channelName: "Shop",
	textKey: "show my cart",
	sample: "show my cart",
	intent: "addToCart",
	source: "laya",
	status: "pending",
	planRunId: "r1",
	seenCount: 2,
	createdAt: 1,
	updatedAt: 2,
};

describe("intents (proxied)", () => {
	test("the list passes its filters to the orchestrator and comes back as it was", async () => {
		const cookie = await signedIn();
		setRespond(
			() =>
				new Response(JSON.stringify({ items: [EXAMPLE], total: 1 }), {
					headers: { "content-type": "application/json" },
				}),
		);

		const response = await call("/api/intents?status=pending&channelId=c1", {
			cookie,
		});

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ items: [EXAMPLE], total: 1 });
		expect(upstream[0]?.url).toContain("status=pending");
		expect(upstream[0]?.url).toContain("channelId=c1");
	});

	test("a verdict is sent as the signed-in admin; an unknown intent or status is refused here", async () => {
		const cookie = await signedIn();
		setRespond(
			() =>
				new Response(
					JSON.stringify({
						item: { ...EXAMPLE, intent: "other", status: "approved" },
					}),
					{ headers: { "content-type": "application/json" } },
				),
		);

		const ok = await call("/api/intents/e1", {
			method: "PATCH",
			cookie,
			body: { intent: "other" },
		});
		expect(ok.status).toBe(200);
		expect(upstream[0]?.method).toBe("PATCH");
		expect(upstream[0]?.url).toContain("/v1/admin/intents/e1");

		upstream.length = 0;
		for (const body of [{ intent: "nonsense" }, { status: "nope" }]) {
			const bad = await call("/api/intents/e1", {
				method: "PATCH",
				cookie,
				body,
			});
			expect(bad.status).toBe(422);
		}
		expect(upstream).toHaveLength(0);
	});

	test("it needs a signed-in admin", async () => {
		expect((await call("/api/intents")).status).toBe(401);
	});
});
