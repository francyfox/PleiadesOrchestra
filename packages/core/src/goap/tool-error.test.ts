import { describe, expect, test } from "bun:test";
import {
	lastToolError,
	parseToolErrorCode,
	TOOL_ERROR_CODES,
	toolErrorText,
} from "#core/goap/tool-error";
import { describeTool } from "#core/goap/webmcp-steps";

const RAW =
	'You cannot add "Secret Shop Item" to the cart <b>because</b> 500 ms';

describe("parseToolErrorCode", () => {
	test("reads the code from the tool's JSON", () => {
		expect(
			parseToolErrorCode('{"error_code":"OUT_OF_STOCK","status":400}'),
		).toBe("OUT_OF_STOCK");
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
