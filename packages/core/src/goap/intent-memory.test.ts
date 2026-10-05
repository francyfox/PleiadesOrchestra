import { describe, expect, test } from "bun:test";
import { createIntentModel, normalizeIntentText } from "./intent-memory.ts";

describe("normalizeIntentText", () => {
	test("lowercases, drops punctuation and collapses spaces", () => {
		expect(normalizeIntentText("  Buy  one, CHEESE!! ")).toBe("buy one cheese");
		expect(normalizeIntentText("Add the brake pads to my cart.")).toBe(
			"add the brake pads to my cart",
		);
	});

	test("keeps letters of any script and digits", () => {
		expect(normalizeIntentText("Купи 2 сыра")).toBe("купи 2 сыра");
	});
});

describe("createIntentModel", () => {
	const model = createIntentModel([
		{ text: "buy one cheese", intent: "addToCart" },
		{ text: "add milk to my cart", intent: "addToCart" },
		{ text: "put a jacket in the basket", intent: "addToCart" },
		{ text: "find brake pads", intent: "search" },
		{ text: "show me phone cases", intent: "search" },
		{ text: "look for a red jacket", intent: "search" },
		{ text: "hello there", intent: "chat" },
		{ text: "thanks a lot", intent: "chat" },
	]);

	test("an example seen before is answered exactly, whatever its case and punctuation", () => {
		expect(model.classify("Find brake pads!")).toMatchObject({
			intent: "search",
			via: "exact",
		});
	});

	test("a new phrase made of known words is answered by the model", () => {
		const hit = model.classify("add a jacket to my cart");
		expect(hit).toMatchObject({ intent: "addToCart", via: "model" });
		expect(hit?.confidence).toBeGreaterThan(0.8);
	});

	test("words it has never seen give no answer (Laya is asked instead)", () => {
		expect(model.classify("zxqv wibble")).toBeUndefined();
	});

	test("an evenly split phrase gives no answer", () => {
		expect(model.classify("cheese find")).toBeUndefined();
	});

	test("an empty model answers nothing", () => {
		expect(createIntentModel([]).classify("hello there")).toBeUndefined();
	});

	test("checkout and removeFromCart are never answered from memory, even for an exact example", () => {
		const risky = createIntentModel([
			{ text: "pay for my order", intent: "checkout" },
			{ text: "remove the milk", intent: "removeFromCart" },
		]);
		expect(risky.classify("pay for my order")).toBeUndefined();
		expect(risky.classify("remove the milk")).toBeUndefined();
	});

	test("a later example for the same text wins (an admin's correction)", () => {
		const corrected = createIntentModel([
			{ text: "show cart", intent: "addToCart" },
			{ text: "show cart", intent: "other" },
		]);
		expect(corrected.classify("show cart")).toMatchObject({ intent: "other" });
	});
});
