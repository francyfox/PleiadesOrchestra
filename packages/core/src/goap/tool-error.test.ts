import { describe, expect, test } from "bun:test";
import {
	lastToolError,
	parseToolErrorCode,
	parseToolErrorOptions,
	TOOL_ERROR_CODES,
	toolErrorText,
} from "#core/goap/tool-error";
import { conversationContext } from "#core/goap/understanding";
import { describeTool } from "#core/goap/webmcp-steps";

const RAW =
	'You cannot add "Secret Shop Item" to the cart <b>because</b> 500 ms';

describe("parseToolErrorCode", () => {
	test("reads the code from the tool's JSON", () => {
		expect(
			parseToolErrorCode('{"error_code":"OUT_OF_STOCK","status":400}'),
		).toBe("OUT_OF_STOCK");
	});

	test("LIMIT_EXCEEDED is in the closed list and has its own wording", () => {
		expect(parseToolErrorCode('{"error_code":"LIMIT_EXCEEDED"}')).toBe(
			"LIMIT_EXCEEDED",
		);
		expect(toolErrorText("LIMIT_EXCEEDED", "en")).toContain("smaller");
	});

	test("raw shop text, old payloads, unknown or non-string codes are UNKNOWN", () => {
		for (const text of [
			RAW,
			"",
			'{"error":"out of stock","status":400}',
			'{"error_code":"SHOP_SAYS_NO"}',
			'{"error_code":7}',
			"null",
		])
			expect(parseToolErrorCode(text)).toBe("UNKNOWN");
	});
});

describe("toolErrorText: every code has its own wording per language", () => {
	test("each code differs from the others and names no raw text", () => {
		for (const language of ["en", "ru", "kk"] as const) {
			const texts = TOOL_ERROR_CODES.map((code) =>
				toolErrorText(code, language, "Lamp"),
			);
			expect(new Set(texts).size).toBe(TOOL_ERROR_CODES.length);
			for (const text of texts) expect(text).not.toContain("{product}");
		}
	});

	test("the product is the visitor's own, quoted; without one a plain word stands in", () => {
		expect(toolErrorText("OUT_OF_STOCK", "en", "Lamp")).toBe(
			"«Lamp» is out of stock.",
		);
		expect(toolErrorText("OUT_OF_STOCK", "ru")).toBe("Товар нет в наличии.");
	});
});

describe("lastToolError", () => {
	test("only the newest answer counts, and only when it was an error", () => {
		const failed = {
			"webmcp:a:result": "error",
			"webmcp:a:text": '{"error_code":"NOT_FOUND"}',
		};
		expect(lastToolError(failed)).toEqual({ tool: "a", code: "NOT_FOUND" });
		expect(
			lastToolError({
				...failed,
				"webmcp:b:result": "ok",
				"webmcp:b:text": "fine",
			}),
		).toBeUndefined();
	});

	test("an error nobody coded is UNKNOWN", () => {
		expect(
			lastToolError({ "webmcp:a:result": "error", "webmcp:a:text": RAW }),
		).toEqual({ tool: "a", code: "UNKNOWN" });
	});
});

describe("the failed step line", () => {
	const describe_ = describeTool({ name: "add_to_cart" }, "addToCart");
	const state = (code: string, lang: string) => ({
		product: "Lamp",
		"page:lang": lang,
		"webmcp:add_to_cart:result": "error",
		"webmcp:add_to_cart:text": JSON.stringify({ error_code: code }),
	});

	test("is the code's template, in the page language", () => {
		expect(describe_(state("OUT_OF_STOCK", "en"), "failed")).toBe(
			"«Lamp» is out of stock.",
		);
		expect(describe_(state("OUT_OF_STOCK", "ru"), "failed")).toBe(
			"«Lamp» нет в наличии.",
		);
	});

	test("never carries the site's raw text", () => {
		const text = describe_(
			{
				product: "Lamp",
				"page:lang": "en",
				"webmcp:add_to_cart:result": "error",
				"webmcp:add_to_cart:text": RAW,
			},
			"failed",
		);
		expect(text).toBe(toolErrorText("UNKNOWN", "en", "Lamp"));
		expect(text).not.toContain("Secret");
	});

	test("without an error answer the old wording stays", () => {
		expect(describe_({ product: "Lamp", "page:lang": "en" }, "failed")).toBe(
			"Couldn't add to cart: Lamp",
		);
	});
});

describe("VARIATION_REQUIRED names the options the tool listed", () => {
	const GOWN =
		'{"error_code":"VARIATION_REQUIRED","status":400,"options":{"Color":["Black"],"Size":["XS","S","M","L"]}}';

	test("options are read as attribute -> values; anything else is dropped", () => {
		expect(parseToolErrorOptions(GOWN)).toEqual({
			Color: ["Black"],
			Size: ["XS", "S", "M", "L"],
		});
		for (const text of [
			'{"error_code":"VARIATION_REQUIRED"}',
			'{"options":"Size: M"}',
			'{"options":{"Size":"M"}}',
			'{"options":{"Size":[]}}',
			"not json",
		])
			expect(parseToolErrorOptions(text)).toBeUndefined();
		// Markup and control characters never reach the visitor; sizes of the list are capped.
		const messy = parseToolErrorOptions(
			JSON.stringify({
				options: { "<b>Size</b>\n": ["M\u0000", ...Array(30).fill("x")] },
			}),
		);
		expect(Object.keys(messy ?? {})).toEqual(["Size"]);
		expect(messy?.Size?.[0]).toBe("M");
		expect(messy?.Size).toHaveLength(12);
	});

	test("the reply lists them in every language; without options the old sentence stays", () => {
		const options = parseToolErrorOptions(GOWN);
		expect(toolErrorText("VARIATION_REQUIRED", "en", "Gown", options)).toBe(
			"«Gown» comes in several options: Color: Black; Size: XS, S, M, L. Which one do you want?",
		);
		expect(toolErrorText("VARIATION_REQUIRED", "ru", "Платье", options)).toBe(
			"«Платье» бывает в нескольких вариантах: Color: Black; Size: XS, S, M, L. Какой вам нужен?",
		);
		expect(
			toolErrorText("VARIATION_REQUIRED", "kk", "Көйлек", options),
		).toContain("Size: XS, S, M, L");
		expect(toolErrorText("VARIATION_REQUIRED", "en", "Gown")).toBe(
			"«Gown» comes in several options. Which one do you want?",
		);
		// More than four values: the attribute is named, the visitor writes the value.
		expect(
			toolErrorText("VARIATION_REQUIRED", "en", "Gown", {
				Color: ["Black", "White"],
				Size: ["XS", "S", "M", "L", "XL"],
			}),
		).toBe(
			"«Gown» comes in several options: Color: Black, White; Size. Which one do you want?",
		);
		// Options are only for this code.
		expect(toolErrorText("OUT_OF_STOCK", "en", "Gown", options)).toBe(
			"«Gown» is out of stock.",
		);
	});

	test("the newest error carries its options for the failure reply", () => {
		expect(
			lastToolError({
				"webmcp:add_to_cart:result": "error",
				"webmcp:add_to_cart:text": GOWN,
			}),
		).toEqual({
			tool: "add_to_cart",
			code: "VARIATION_REQUIRED",
			options: { Color: ["Black"], Size: ["XS", "S", "M", "L"] },
		});
	});
});

describe("a failure that asks the visitor something is quoted as the question their next message answers", () => {
	// `conversationContext` treats an assistant message as a question only by its punctuation: a template that
	// asks without «?» made the answer («size M») a brand-new request, and the search for it added a random product.
	const ASKING = [
		"MISSING_ARGUMENT",
		"VARIATION_REQUIRED",
		"INVALID_QUANTITY",
		"LIMIT_EXCEEDED",
	] as const;

	test("every asking template, with and without options, in every language", () => {
		for (const language of ["en", "ru", "kk"] as const)
			for (const code of ASKING)
				for (const options of [undefined, { Size: ["S", "M"] }]) {
					const reply = toolErrorText(code, language, "Gown", options);
					const said = conversationContext([
						{ role: "user", content: "add the gown" },
						{ role: "assistant", content: reply },
					]);
					expect(said.replyTo, `${code} ${language}: ${reply}`).toBe(reply);
					expect(said.history).toEqual([
						{ role: "user", content: "add the gown" },
					]);
				}
	});
});
