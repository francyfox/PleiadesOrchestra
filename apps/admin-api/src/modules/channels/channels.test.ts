import { describe, expect, test } from "bun:test";
import {
	CHANNEL,
	call,
	json,
	setRespond,
	signedIn,
	upstream,
	useHarness,
} from "../../app.harness.testing.ts";

useHarness();

describe("channels (proxied)", () => {
	test("channel creation validates slug and name, then returns the one-time secret", async () => {
		const cookie = await signedIn();

		const bad = await call("/api/channels", {
			method: "POST",
			cookie,
			body: { slug: "Bad Slug", name: "X" },
		});
		expect(await bad.json()).toEqual({ error: "invalid_channel" });
		expect(upstream).toHaveLength(0);

		setRespond(() => json({ channel: CHANNEL, secretKey: "sk" }));
		const ok = await call("/api/channels", {
			method: "POST",
			cookie,
			body: {
				slug: "site",
				name: " Site ",
				allowedOrigins: ["https://shop.example"],
			},
		});
		expect(await ok.json()).toMatchObject({
			secretKey: "sk",
			channel: { slug: "site" },
		});
		expect(upstream[0]?.body).toEqual({
			slug: "site",
			name: "Site",
			kind: "web",
			accessMode: "open",
			allowedOrigins: ["https://shop.example"],
		});
	});

	test("a PATCH that omits accessMode doesn't send one (Optional enums must not default)", async () => {
		const cookie = await signedIn();
		setRespond(() => json({ channel: CHANNEL }));
		await call("/api/channels/c1", {
			method: "PATCH",
			cookie,
			body: { disabled: true },
		});
		expect(upstream[0]?.body).toEqual({ disabled: true });
	});
});
