import { describe, expect, test } from "bun:test";
import { rewritePseudoClasses } from "./css-pseudo.ts";
import { dedupeByName } from "./discovery.ts";
import { parseArgs, retryAsJsonString } from "./execute-tool.ts";
import { declarativeSignature } from "./observer.ts";
import { assertValidTool } from "./registry.ts";
import { isExpectedReply } from "./remote-bridge.ts";
import type { NormalizedTool } from "./types.ts";

const tool = (name: string, extra: Partial<NormalizedTool> = {}) =>
	({ name, ...extra }) as NormalizedTool;

test("rewritePseudoClasses maps tool pseudo-classes, null when unchanged", () => {
	expect(rewritePseudoClasses("form:tool-form-active{a:b}")).toBe(
		"form.tool-form-active{a:b}",
	);
	expect(rewritePseudoClasses("b:tool-submit-active{}")).toBe(
		"b.tool-submit-active{}",
	);
	expect(rewritePseudoClasses("a:hover{}")).toBeNull();
});

test("parseArgs parses JSON strings and keeps other input", () => {
	expect(parseArgs('{"a":1}')).toEqual({ a: 1 });
	expect(parseArgs("not json")).toBe("not json");
	expect(parseArgs({ a: 1 })).toEqual({ a: 1 });
});

describe("retryAsJsonString", () => {
	test("retries once with a JSON string on a parse failure", async () => {
		const seen: unknown[] = [];
		const result = await retryAsJsonString(
			async (i) => {
				seen.push(i);
				if (typeof i !== "string") throw new Error("Failed to parse input");
				return "ok";
			},
			{ a: 1 },
		);
		expect(result).toBe("ok");
		expect(seen).toEqual([{ a: 1 }, '{"a":1}']);
	});

	test("rethrows unrelated errors without retrying", async () => {
		let calls = 0;
		const run = retryAsJsonString(async () => {
			calls++;
			throw new Error("boom");
		}, {});
		await expect(run).rejects.toThrow("boom");
		expect(calls).toBe(1);
	});
});

test("dedupeByName keeps the first tool per name", () => {
	const out = dedupeByName([tool("a", { origin: "1" }), tool("a"), tool("b")]);
	expect(out.map((t) => t.origin ?? t.name)).toEqual(["1", "b"]);
});

test("declarativeSignature only covers form tools", () => {
	const form = {} as HTMLFormElement;
	const sig = declarativeSignature([
		tool("imperative"),
		tool("f", { _form: form, description: "d" }),
	]);
	expect(sig).toBe('[{"name":"f","description":"d"}]');
});

describe("isExpectedReply", () => {
	const from = {} as Window;
	const match = {
		from,
		originOk: (o: string) => o === "https://a.example",
		type: "T",
		requestId: "1",
	};
	const ev = (over: Record<string, unknown>) =>
		({
			source: from,
			origin: "https://a.example",
			data: { type: "T", requestId: "1" },
			...over,
		}) as unknown as MessageEvent;

	test("accepts only the matching source, origin, type and id", () => {
		expect(isExpectedReply(ev({}), match)).toBe(true);
		expect(isExpectedReply(ev({ source: {} }), match)).toBe(false);
		expect(isExpectedReply(ev({ origin: "https://b.example" }), match)).toBe(
			false,
		);
		expect(
			isExpectedReply(ev({ data: { type: "T", requestId: "2" } }), match),
		).toBe(false);
		expect(isExpectedReply(ev({ data: null }), match)).toBe(false);
	});
});

describe("assertValidTool", () => {
	test("rejects non-string names and descriptions from page scripts", () => {
		expect(() => assertValidTool({ name: 42, description: "d" })).toThrow(
			"Invalid tool name",
		);
		expect(() => assertValidTool({ name: "a", description: {} })).toThrow(
			"Invalid tool description",
		);
		expect(() => assertValidTool("search")).toThrow("Invalid tool object");
	});

	test("narrows a valid definition to RawTool", () => {
		const input: unknown = { name: "search", description: "Find items" };
		assertValidTool(input);
		expect(input.name).toBe("search");
	});
});
