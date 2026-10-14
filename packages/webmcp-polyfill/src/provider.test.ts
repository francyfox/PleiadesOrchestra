import { describe, expect, test } from "bun:test";
import { classifyRequest, normalizeOrigins } from "./provider.ts";

describe("normalizeOrigins", () => {
	test("reduces entries to bare origins and drops wildcards/garbage", () => {
		expect(
			normalizeOrigins([" https://a.example/path?q=1 ", "*", "nope", "null"]),
		).toEqual(["https://a.example"]);
	});

	test("undefined yields an empty list", () => {
		expect(normalizeOrigins(undefined)).toEqual([]);
	});
});

describe("classifyRequest", () => {
	const source = {} as Window;
	const exposed = new Set(["https://good.example"]);
	const msg = (origin: string, data: unknown, src: unknown = source) =>
		({ origin, data, source: src }) as unknown as MessageEvent;

	test("ignores origins outside the allow-list", () => {
		const e = msg("https://evil.example", { type: "WEBMCP_GET_TOOLS_REQUEST" });
		expect(classifyRequest(exposed, e)).toBeNull();
	});

	test("ignores messages without a source window", () => {
		const e = msg(
			"https://good.example",
			{ type: "WEBMCP_GET_TOOLS_REQUEST" },
			null,
		);
		expect(classifyRequest(exposed, e)).toBeNull();
	});

	test("ignores unknown message types", () => {
		expect(
			classifyRequest(exposed, msg("https://good.example", {})),
		).toBeNull();
	});

	test("execute prefers inputObject over legacy args", () => {
		const data = {
			type: "WEBMCP_EXECUTE_TOOL_REQUEST",
			name: "t",
			requestId: "1",
		};
		const legacy = classifyRequest(
			exposed,
			msg("https://good.example", { ...data, args: { a: 1 } }),
		);
		expect(legacy).toMatchObject({ kind: "execute", input: { a: 1 } });
		const current = classifyRequest(
			exposed,
			msg("https://good.example", { ...data, inputObject: { b: 2 }, args: 1 }),
		);
		expect(current).toMatchObject({ input: { b: 2 } });
	});
});
