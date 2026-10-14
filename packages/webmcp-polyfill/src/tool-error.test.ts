import { describe, expect, test } from "bun:test";
import { createProvider } from "./provider.ts";
import { fromWireError, toWireError } from "./tool-error.ts";
import type { NormalizedTool } from "./types.ts";

describe("toWireError", () => {
	test("plain error carries only the message", () => {
		expect(toWireError(new Error("boom"))).toEqual({ error: "boom" });
	});

	test("status and retryAfter travel when the tool set them", () => {
		const err = Object.assign(new Error("slow down"), {
			status: 429,
			retryAfter: 30,
		});
		expect(toWireError(err)).toEqual({
			error: "slow down",
			status: 429,
			retryAfter: 30,
		});
	});

	test("numeric Retry-After string is accepted as seconds", () => {
		const err = Object.assign(new Error("x"), { status: 503, retryAfter: "5" });
		expect(toWireError(err)).toEqual({
			error: "x",
			status: 503,
			retryAfter: 5,
		});
	});

	test("invalid status and retryAfter are dropped", () => {
		const err = Object.assign(new Error("x"), {
			status: 42,
			retryAfter: -1,
		});
		expect(toWireError(err)).toEqual({ error: "x" });
		expect(
			toWireError(Object.assign(new Error("x"), { status: "429" })),
		).toEqual({ error: "x" });
	});

	test("non-Error throws become a string message", () => {
		expect(toWireError("nope")).toEqual({ error: "nope" });
	});
});

describe("fromWireError", () => {
	test("rebuilds an Error with validated status and retryAfter", () => {
		const err = fromWireError({
			error: "slow down",
			status: 429,
			retryAfter: 30,
		});
		expect(err).toBeInstanceOf(Error);
		expect(err.message).toBe("slow down");
		expect(err.status).toBe(429);
		expect(err.retryAfter).toBe(30);
	});

	test("ignores untrusted garbage from the other window", () => {
		const err = fromWireError({ error: "x", status: 1e9, retryAfter: "soon" });
		expect(err.status).toBeUndefined();
		expect(err.retryAfter).toBeUndefined();
		expect("status" in err).toBe(false);
	});
});

test("provider replies with status and retryAfter of a failed tool", async () => {
	const tool = {
		name: "search",
		origin: "https://shop.test",
	} as NormalizedTool;
	const handle = createProvider({
		exposed: new Set(["https://host.test"]),
		listLocalTools: () => [tool],
		executeTool: async () => {
			throw Object.assign(new Error("rate limited"), {
				status: 429,
				retryAfter: 10,
			});
		},
	});
	const sent: unknown[] = [];
	const source = { postMessage: (m: unknown) => sent.push(m) };
	await handle({
		origin: "https://host.test",
		source,
		data: {
			type: "WEBMCP_EXECUTE_TOOL_REQUEST",
			requestId: "r1",
			name: "search",
			inputObject: {},
		},
	} as unknown as MessageEvent);
	expect(sent).toEqual([
		{
			type: "WEBMCP_EXECUTE_TOOL_RESPONSE",
			requestId: "r1",
			success: false,
			error: "rate limited",
			status: 429,
			retryAfter: 10,
		},
	]);
});
