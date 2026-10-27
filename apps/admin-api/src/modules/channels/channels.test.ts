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

	test("persona is read from and replaced upstream, with the admin id on the write", async () => {
		const cookie = await signedIn();
		const persona = {
			botName: "Mila",
			tone: "warm",
			instructions: "Help with bookings.",
			defaultLang: "ru",
			greeting: "",
			forbiddenTopics: ["politics"],
			handoffContact: "help@example.com",
		};
		const view = {
			persona,
			defaults: { ...persona, botName: "Альбедо" },
			prompt: "Role…\n\nFixed rules (cannot be changed):",
			fixed: "Fixed rules (cannot be changed):",
		};
		setRespond(() => json(view));
		const read = await call("/api/channels/ch_1/persona", { cookie });
		expect(await read.json()).toEqual(view);
		expect(upstream[0]?.url).toBe(
			"http://orchestrator/v1/admin/channels/ch_1/persona",
		);

		const saved = await call("/api/channels/ch_1/persona", {
			method: "PUT",
			cookie,
			body: persona,
		});
		expect(await saved.json()).toEqual(view);
		expect(upstream[1]?.method).toBe("PUT");
		expect(upstream[1]?.body).toEqual(persona);

		const preview = await call("/api/channels/ch_1/persona/preview", {
			method: "POST",
			cookie,
			body: persona,
		});
		expect(await preview.json()).toEqual(view);
		expect(upstream[2]?.url).toBe(
			"http://orchestrator/v1/admin/channels/ch_1/persona/preview",
		);

		const bad = await call("/api/channels/ch_1/persona", {
			method: "PUT",
			cookie,
			body: { ...persona, defaultLang: "Russian" },
		});
		expect(await bad.json()).toEqual({ error: "invalid_language" });
		expect(upstream).toHaveLength(3);
	});

	test("intent sets travel to the orchestrator when given and are left out otherwise", async () => {
		const cookie = await signedIn();
		setRespond(() => json({ channel: CHANNEL, secretKey: "sk" }));

		await call("/api/channels", {
			method: "POST",
			cookie,
			body: { slug: "with-sets", name: "S", intentSets: ["shop"] },
		});
		expect(upstream[0]?.body).toMatchObject({ intentSets: ["shop"] });

		await call("/api/channels", {
			method: "POST",
			cookie,
			body: { slug: "bare", name: "B" },
		});
		expect(upstream[1]?.body).not.toHaveProperty("intentSets");
	});

	test("the several-tasks switch travels to the orchestrator", async () => {
		const cookie = await signedIn();
		setRespond(() => json({ channel: { ...CHANNEL, severalTasks: true } }));
		const res = await call(`/api/channels/${CHANNEL.id}`, {
			method: "PATCH",
			cookie,
			body: { severalTasks: true },
		});
		expect(res.status).toBe(200);
		expect(upstream.at(-1)?.body).toMatchObject({ severalTasks: true });
	});
});
