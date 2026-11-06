import { expect, test } from "bun:test";
import { FALLBACK_VERSION, resolveVersion } from "./version.ts";

test("the version comes from PLEIADES_VERSION, else the one built in", () => {
	expect(resolveVersion({ PLEIADES_VERSION: "0.13.10" })).toBe("0.13.10");
	expect(resolveVersion({})).toBe(FALLBACK_VERSION);
	// An empty variable (a blank line in .env) is not a version.
	expect(resolveVersion({ PLEIADES_VERSION: " " })).toBe(FALLBACK_VERSION);
});
