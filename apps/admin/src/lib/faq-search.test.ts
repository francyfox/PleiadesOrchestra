import { describe, expect, test } from "bun:test";
import { createFaqSearch } from "./faq-search";

const items = [
	{
		id: "connect",
		q: "How do I connect the widget to my site?",
		a: "Paste the embed code into your pages.",
	},
	{
		id: "keys",
		q: "Which key goes where?",
		a: "The public pk_ key goes into the page; the secret sk_ key stays on the server.",
	},
	{
		id: "delete",
		q: "Why can't I delete a channel?",
		a: "Channels are only disabled, never deleted.",
	},
];

describe("createFaqSearch", () => {
	const search = createFaqSearch(items);

	test("an empty query keeps every question, in reading order", () => {
		expect(search("")).toEqual(["connect", "keys", "delete"]);
		expect(search("   ")).toEqual(["connect", "keys", "delete"]);
	});

	test("finds by the question", () => {
		expect(search("delete")[0]).toBe("delete");
	});

	test("finds by the answer text", () => {
		expect(search("secret")[0]).toBe("keys");
	});

	test("a single letter already filters: entries that contain it, question hits first", () => {
		const letters = createFaqSearch([
			{ id: "none", q: "Something else", a: "Nothing relevant" },
			{ id: "answerOnly", q: "Which channel?", a: "Use the zone key." },
			{ id: "inQuestion", q: "Where is the zebra?", a: "Far away." },
		]);
		expect(letters("z")).toEqual(["inQuestion", "answerOnly"]);
		expect(letters("Z")).toEqual(["inQuestion", "answerOnly"]);
	});

	test("two letters are matched as plain text too, not fuzzily", () => {
		const two = createFaqSearch([
			{ id: "a", q: "Delete a channel", a: "Only disabled." },
			{ id: "b", q: "Access levels", a: "Whitelist or open." },
		]);
		expect(two("de")).toEqual(["a"]);
		expect(two("xq")).toEqual([]);
	});

	test("exact matches come before fuzzy ones once the query is longer", () => {
		const mixed = createFaqSearch([
			{ id: "fuzzy", q: "Rotating the keys", a: "Use the button." },
			{
				id: "exact",
				q: "Why is my token rejected?",
				a: "The token is not valid.",
			},
		]);
		expect(mixed("token")[0]).toBe("exact");
	});

	test("forgives a typo", () => {
		expect(search("widjet")).toContain("connect");
	});

	test("nothing matching is an empty list, not everything", () => {
		expect(search("zzqqxxvv")).toEqual([]);
	});

	test("works for Cyrillic", () => {
		const ru = createFaqSearch([
			{ id: "a", q: "Как подключить виджет?", a: "Вставьте код на страницу." },
			{
				id: "b",
				q: "Почему канал нельзя удалить?",
				a: "Каналы только отключают.",
			},
		]);
		expect(ru("удалить")[0]).toBe("b");
		expect(ru("виджет")[0]).toBe("a");
	});
});
