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

	test("the catalog language goes to the orchestrator as a language code; anything else is refused here", async () => {
		const cookie = await signedIn();
		setRespond(() => json({ channel: CHANNEL, secretKey: "sk" }));

		await call("/api/channels", {
			method: "POST",
			cookie,
			body: { slug: "ru-site", name: "Ru", catalogLanguage: "ru" },
		});
		expect(upstream[0]?.body).toMatchObject({ catalogLanguage: "ru" });

		await call("/api/channels", {
			method: "POST",
			cookie,
			body: { slug: "plain", name: "Plain" },
		});
		// Left out, so the orchestrator's own default (English) applies.
		expect(upstream[1]?.body).not.toHaveProperty("catalogLanguage");

		const before = upstream.length;
		for (const bad of ["русский", "english", "EN", "e"]) {
			const refused = await call("/api/channels", {
				method: "POST",
				cookie,
				body: { slug: "x", name: "X", catalogLanguage: bad },
			});
			expect(await refused.json()).toEqual({ error: "invalid_language" });
		}
		expect(upstream).toHaveLength(before);

		const patch = await call("/api/channels/c1", {
			method: "PATCH",
			cookie,
			body: { catalogLanguage: "русский" },
		});
		expect(await patch.json()).toEqual({ error: "invalid_language" });
	});
});
