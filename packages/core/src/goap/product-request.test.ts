import { describe, expect, test } from "bun:test";
import { parseProductRequest } from "./product-request.ts";

describe("parseProductRequest", () => {
	test("reads query and quantity from the model's JSON", () => {
		expect(
			parseProductRequest('{"query":"cheese","quantity":3}', "купи 3 сыра"),
		).toEqual({
			query: "cheese",
			quantity: 3,
		});
	});

	test("ignores chatter around the JSON", () => {
		expect(
			parseProductRequest(
				'Конечно! {"query": " milk ", "quantity": 1} Готово.',
				"молоко",
			),
		).toEqual({ query: "milk", quantity: 1 });
	});

	test("a missing or silly quantity becomes 1, a huge one is capped", () => {
		expect(parseProductRequest('{"query":"tea"}', "чай").quantity).toBe(1);
		expect(
			parseProductRequest('{"query":"tea","quantity":-2}', "чай").quantity,
		).toBe(1);
		expect(
			parseProductRequest('{"query":"tea","quantity":2.5}', "чай").quantity,
		).toBe(1);
		expect(
			parseProductRequest('{"query":"tea","quantity":5000}', "чай").quantity,
		).toBe(99);
	});

	test("without usable JSON the user's own words and first number are used", () => {
		expect(parseProductRequest("не знаю", "купи 4 яблока")).toEqual({
			query: "купи 4 яблока",
			quantity: 4,
		});
		expect(parseProductRequest('{"query":""}', "сыр")).toEqual({
			query: "сыр",
			quantity: 1,
		});
	});
});
