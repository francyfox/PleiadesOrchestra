import { expect, test } from "bun:test";
import {
	CreateChannelForm,
	PersonaForm,
	UpdateChannelForm,
} from "admin-api/forms";
import { channelOverrides, personaOverrides } from "./actions.ts";
import { parseForm } from "./forms/field-errors.ts";

const form = (fields: Record<string, string>) => {
	const data = new FormData();
	for (const [name, value] of Object.entries(fields)) data.append(name, value);
	return data;
};

test("create: origins typed as text become a list, slug and name are required", () => {
	const ok = parseForm(
		CreateChannelForm,
		form({
			slug: "shop",
			name: "Shop",
			accessMode: "open",
			allowedOrigins: "https://a.com, https://b.com\nhttps://c.com",
			catalogLanguage: "en",
		}),
		channelOverrides,
	);
	expect(ok).toEqual({
		ok: true,
		body: {
			slug: "shop",
			name: "Shop",
			accessMode: "open",
			allowedOrigins: ["https://a.com", "https://b.com", "https://c.com"],
			catalogLanguage: "en",
		},
	});
	const bad = parseForm(
		CreateChannelForm,
		form({ slug: "", name: " ", allowedOrigins: "" }),
		channelOverrides,
	);
	expect(bad.ok).toBe(false);
	if (!bad.ok) expect(Object.keys(bad.errors).sort()).toEqual(["name", "slug"]);
});

test("update: a form without the origins field leaves them out", () => {
	const result = parseForm(
		UpdateChannelForm,
		form({ id: "c1", name: "", accessMode: "whitelist" }),
		channelOverrides,
	);
	expect(result).toEqual({
		ok: true,
		body: { id: "c1", accessMode: "whitelist" },
	});
});

test("persona: empty fields are values, topics become a list, long instructions fail", () => {
	const fields = {
		id: "c1",
		botName: " ",
		tone: "",
		instructions: "",
		defaultLang: "",
		greeting: "",
		forbiddenTopics: "a\n\n b ",
		handoffContact: "",
	};
	expect(parseForm(PersonaForm, form(fields), personaOverrides)).toEqual({
		ok: true,
		body: { ...fields, botName: "", forbiddenTopics: ["a", "b"] },
	});
	const long = parseForm(
		PersonaForm,
		form({ ...fields, instructions: "x".repeat(2001) }),
		personaOverrides,
	);
	expect(long.ok).toBe(false);
});
