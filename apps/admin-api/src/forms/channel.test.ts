import { expect, test } from "bun:test";
import { Value } from "@sinclair/typebox/value";
import { CreateChannelForm, PersonaForm, UpdateChannelForm } from "./forms.ts";

test("CreateChannelForm wants a slug of lowercase, digits and dashes", () => {
	expect(Value.Check(CreateChannelForm, { slug: "my-site", name: "N" })).toBe(
		true,
	);
	expect(Value.Check(CreateChannelForm, { slug: "My Site", name: "N" })).toBe(
		false,
	);
	expect(Value.Check(CreateChannelForm, { slug: "a", name: "" })).toBe(false);
});

test("catalogLanguage is a code, not a name", () => {
	const body = { slug: "a", name: "N" };
	expect(
		Value.Check(CreateChannelForm, { ...body, catalogLanguage: "pt-BR" }),
	).toBe(true);
	expect(
		Value.Check(CreateChannelForm, { ...body, catalogLanguage: "English" }),
	).toBe(false);
});

test("UpdateChannelForm needs only the id; PersonaForm caps instructions", () => {
	expect(Value.Check(UpdateChannelForm, { id: "c" })).toBe(true);
	const persona = {
		id: "c",
		botName: "",
		tone: "",
		instructions: "x".repeat(2001),
		defaultLang: "",
		greeting: "",
		forbiddenTopics: [],
		handoffContact: "",
	};
	expect(Value.Check(PersonaForm, persona)).toBe(false);
	expect(Value.Check(PersonaForm, { ...persona, instructions: "ok" })).toBe(
		true,
	);
});
