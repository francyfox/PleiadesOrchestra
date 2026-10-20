import { expect, test } from "bun:test";
import { confirmEmailMatches } from "./confirm-email";

test("matches after trimming, ignoring case", () => {
	expect(confirmEmailMatches("  Ann@Example.com ", "ann@example.com")).toBe(
		true,
	);
});

test("rejects a different or empty address", () => {
	expect(confirmEmailMatches("ann@example.org", "ann@example.com")).toBe(false);
	expect(confirmEmailMatches("", "")).toBe(false);
});
