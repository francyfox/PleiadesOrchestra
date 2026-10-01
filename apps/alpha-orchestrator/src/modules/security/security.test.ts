import { describe, expect, test } from "bun:test";
import {
	hashIp,
	matchesHash,
	randomToken,
	sha256Hex,
} from "./security.service.ts";

describe("security", () => {
	test("randomToken keeps its prefix and is different every time", () => {
		const first = randomToken("sk_", 32);
		expect(first.startsWith("sk_")).toBe(true);
		expect(first).not.toBe(randomToken("sk_", 32));
	});

	test("hashIp depends on the salt", () => {
		expect(hashIp("1.2.3.4", "a")).not.toBe(hashIp("1.2.3.4", "b"));
		expect(hashIp("1.2.3.4", "a")).toBe(sha256Hex("a:1.2.3.4"));
	});

	test("matchesHash accepts the right secret and rejects others", () => {
		const stored = sha256Hex("secret");
		expect(matchesHash("secret", stored)).toBe(true);
		expect(matchesHash("other", stored)).toBe(false);
	});
});
