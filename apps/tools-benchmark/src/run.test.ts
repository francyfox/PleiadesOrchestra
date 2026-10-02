import { describe, expect, test } from "bun:test";
import { extractArguments, rowsFor } from "./run.ts";

describe("extractArguments", () => {
	test("schema mode reads the JSON in the message content", () => {
		const completion = {
			choices: [{ message: { content: '{"query":"cheese"}' } }],
		};
		expect(extractArguments(completion, "schema", "search_products")).toEqual({
			query: "cheese",
		});
	});

	test("schema mode: unparseable content is undefined", () => {
		const completion = { choices: [{ message: { content: "Sure! here" } }] };
		expect(extractArguments(completion, "schema", "x")).toBeUndefined();
	});

	test("native mode reads the first tool call's arguments, string or object", () => {
		const asString = {
			choices: [
				{
					message: {
						tool_calls: [{ function: { name: "t", arguments: '{"a":1}' } }],
					},
				},
			],
		};
		const asObject = {
			choices: [
				{
					message: {
						tool_calls: [{ function: { name: "t", arguments: { a: 1 } } }],
					},
				},
			],
		};
		expect(extractArguments(asString, "native", "t")).toEqual({ a: 1 });
		expect(extractArguments(asObject, "native", "t")).toEqual({ a: 1 });
	});

	test("native mode: a call to another tool, or no call, is undefined", () => {
		const wrong = {
			choices: [
				{
					message: {
						tool_calls: [{ function: { name: "other", arguments: "{}" } }],
					},
				},
			],
		};
		expect(extractArguments(wrong, "native", "t")).toBeUndefined();
		expect(
			extractArguments(
				{ choices: [{ message: { content: "hi" } }] },
				"native",
				"t",
			),
		).toBeUndefined();
	});
});

describe("rowsFor", () => {
	test("splits results by language", () => {
		const results = [
			{
				id: "a.en",
				lang: "en" as const,
				ok: true,
				valid: true,
				latencyMs: 10,
				actual: {},
			},
			{
				id: "a.ru",
				lang: "ru" as const,
				ok: false,
				valid: true,
				latencyMs: 30,
				actual: {},
			},
		];
		const rows = rowsFor("m", "schema", results, ["en", "ru"]);
		expect(rows.map((row) => [row.lang, row.summary.accuracy])).toEqual([
			["en", 1],
			["ru", 0],
		]);
	});
});
