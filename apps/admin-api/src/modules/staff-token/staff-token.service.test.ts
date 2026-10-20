import { describe, expect, test } from "bun:test";
import {
	generateToken,
	hashToken,
	isTokenShape,
	tokenMatches,
} from "./staff-token.service.ts";

describe("staff token", () => {
	test("is 32 random bytes in base64url, different every time", () => {
		const a = generateToken();
		expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
		expect(generateToken()).not.toBe(a);
	});

	test("hashes to SHA-256 hex", () => {
		expect(hashToken("abc")).toBe(
			"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
		);
	});

	test("matches its own hash and nothing else", () => {
		const token = generateToken();
		expect(tokenMatches(token, hashToken(token))).toBe(true);
		expect(tokenMatches(generateToken(), hashToken(token))).toBe(false);
		expect(tokenMatches(token, null)).toBe(false);
		expect(tokenMatches(token, "")).toBe(false);
		expect(tokenMatches(token, "abc")).toBe(false);
	});

	test("a malformed token never matches, even if its hash is stored", () => {
		for (const bad of ["", "short", "a b".padEnd(50, "x"), "é".repeat(50)]) {
			expect(isTokenShape(bad)).toBe(false);
			expect(tokenMatches(bad, hashToken(bad))).toBe(false);
		}
	});
});
