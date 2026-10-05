import { describe, expect, spyOn, test } from "bun:test";
import {
	type ConfigError,
	describeConfigError,
	normalizePosition,
	parseCustomerContext,
	resolveConfig,
} from "@/lib/config/config.ts";

const key = "pk_abcdefghijklmnop";

describe("resolveConfig: agent URL", () => {
	test("accepts https and strips the trailing slash", () => {
		const result = resolveConfig({
			agentUrl: "https://agent.example.com/",
			publishableKey: key,
		});
		expect(result).toEqual({
			ok: true,
			config: { agentUrl: "https://agent.example.com", publishableKey: key },
		});
	});

	test("keeps a path prefix (agent behind a reverse proxy)", () => {
		const result = resolveConfig({
			agentUrl: "https://example.com/pleiades/",
			publishableKey: key,
		});
		expect(result.ok && result.config.agentUrl).toBe(
			"https://example.com/pleiades",
		);
	});

	test("allows plain http only for local development", () => {
		for (const url of [
			"http://localhost:3000",
			"http://127.0.0.1:3000",
			"http://[::1]:3000",
		]) {
			expect(resolveConfig({ agentUrl: url, publishableKey: key }).ok).toBe(
				true,
			);
		}
	});

	test("refuses plain http elsewhere: the visitor token would travel in clear text", () => {
		expect(
			resolveConfig({
				agentUrl: "http://agent.example.com",
				publishableKey: key,
			}),
		).toEqual({
			ok: false,
			error: "insecure_agent_url",
		});
	});

	test("refuses credentials embedded in the URL, other schemes, and garbage", () => {
		for (const url of [
			"https://user:pass@agent.example.com",
			"javascript:alert(1)",
			"ftp://x.example",
			"not a url",
		]) {
			expect(resolveConfig({ agentUrl: url, publishableKey: key })).toEqual({
				ok: false,
				error: "invalid_agent_url",
			});
		}
	});

	test("a missing URL is reported as missing", () => {
		expect(resolveConfig({ agentUrl: "", publishableKey: key })).toEqual({
			ok: false,
			error: "missing_agent_url",
		});
		expect(resolveConfig({ publishableKey: key })).toEqual({
			ok: false,
			error: "missing_agent_url",
		});
	});
});

describe("resolveConfig: key", () => {
	const agentUrl = "https://agent.example.com";

	test("accepts a publishable key", () => {
		expect(resolveConfig({ agentUrl, publishableKey: key }).ok).toBe(true);
	});

	test("a secret key must never reach a browser", () => {
		expect(
			resolveConfig({ agentUrl, publishableKey: "sk_abcdefghijklmnop" }),
		).toEqual({
			ok: false,
			error: "secret_key",
		});
	});

	test("anything that isn't pk_… is invalid, empty is missing", () => {
		expect(resolveConfig({ agentUrl, publishableKey: "hello" })).toEqual({
			ok: false,
			error: "invalid_key",
		});
		expect(resolveConfig({ agentUrl, publishableKey: "pk_" })).toEqual({
			ok: false,
			error: "invalid_key",
		});
		expect(resolveConfig({ agentUrl, publishableKey: "  " })).toEqual({
			ok: false,
			error: "missing_key",
		});
		expect(resolveConfig({ agentUrl })).toEqual({
			ok: false,
			error: "missing_key",
		});
	});
});

describe("normalizePosition", () => {
	test("defaults to the bottom-left corner", () => {
		expect(normalizePosition(undefined)).toBe("bottom-left");
		expect(normalizePosition("")).toBe("bottom-left");
		expect(normalizePosition("middle")).toBe("bottom-left");
	});

	test("accepts the four corners, case-insensitively", () => {
		expect(normalizePosition("bottom-right")).toBe("bottom-right");
		expect(normalizePosition("Top-Left")).toBe("top-left");
		expect(normalizePosition("top-right")).toBe("top-right");
		expect(normalizePosition("bottom-left")).toBe("bottom-left");
	});
});

describe("describeConfigError", () => {
	const codes: ConfigError[] = [
		"missing_agent_url",
		"invalid_agent_url",
		"insecure_agent_url",
		"missing_key",
		"secret_key",
		"invalid_key",
	];

	test("every error says what to do, and the code stays greppable", () => {
		for (const code of codes) {
			const text = describeConfigError(code);
			expect(text.startsWith(`${code}: `)).toBe(true);
			expect(text.length).toBeGreaterThan(code.length + 20);
		}
	});

	test("a secret key is called SECRET, and the message names the PUBLIC pk_ key to use instead", () => {
		const text = describeConfigError("secret_key");
		expect(text).toContain("SECRET");
		expect(text).toContain("PUBLIC");
		expect(text).toContain("pk_");
	});

	test("a missing or malformed key points at the PUBLIC key too", () => {
		expect(describeConfigError("missing_key")).toContain("PUBLIC");
		expect(describeConfigError("invalid_key")).toContain("PUBLIC");
	});
});

describe("parseCustomerContext", () => {
	test("absent, empty or whitespace-only attribute is undefined, silently", () => {
		const error = spyOn(console, "error").mockImplementation(() => {});
		expect(parseCustomerContext(undefined)).toBeUndefined();
		expect(parseCustomerContext(null)).toBeUndefined();
		expect(parseCustomerContext("")).toBeUndefined();
		expect(parseCustomerContext("   ")).toBeUndefined();
		expect(error).not.toHaveBeenCalled();
		error.mockRestore();
	});

	test("parses a flat JSON object of strings/numbers/booleans", () => {
		expect(
			parseCustomerContext(
				'{"country":"Kazakhstan","city":"Qyzylorda","loyaltyTier":2,"vip":true}',
			),
		).toEqual({
			country: "Kazakhstan",
			city: "Qyzylorda",
			loyaltyTier: 2,
			vip: true,
		});
	});

	test("invalid JSON is dropped with a console warning", () => {
		const error = spyOn(console, "error").mockImplementation(() => {});
		expect(parseCustomerContext("{not json")).toBeUndefined();
		expect(error).toHaveBeenCalledTimes(1);
		expect(error.mock.calls[0]?.[0]).toContain("invalid_customer_context");
		error.mockRestore();
	});

	test("a JSON array or scalar (not an object) is dropped with a console warning", () => {
		const error = spyOn(console, "error").mockImplementation(() => {});
		expect(parseCustomerContext("[1,2,3]")).toBeUndefined();
		expect(parseCustomerContext("42")).toBeUndefined();
		expect(parseCustomerContext("null")).toBeUndefined();
		expect(error).toHaveBeenCalledTimes(3);
		error.mockRestore();
	});

	test("a nested object/array field is dropped, but the rest of the flat fields survive", () => {
		const error = spyOn(console, "error").mockImplementation(() => {});
		expect(
			parseCustomerContext(
				'{"city":"Qyzylorda","address":{"street":"x"},"tags":[1,2]}',
			),
		).toEqual({ city: "Qyzylorda" });
		expect(error).toHaveBeenCalledTimes(2);
		error.mockRestore();
	});

	test("an object with only unusable fields is undefined, not empty", () => {
		const error = spyOn(console, "error").mockImplementation(() => {});
		expect(parseCustomerContext('{"address":{"street":"x"}}')).toBeUndefined();
		error.mockRestore();
	});
});
