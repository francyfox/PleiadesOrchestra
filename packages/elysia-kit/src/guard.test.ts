import { describe, expect, test } from "bun:test";
import { hasBearer } from "./guard.ts";

const withAuth = (value?: string) =>
	new Request(
		"http://localhost/a",
		value ? { headers: { authorization: value } } : {},
	);

describe("hasBearer", () => {
	test("accepts exactly the configured token", () => {
		expect(hasBearer(withAuth("Bearer s3cret"), "s3cret")).toBe(true);
		expect(hasBearer(withAuth("Bearer s3cret2"), "s3cret")).toBe(false);
		expect(hasBearer(withAuth("s3cret"), "s3cret")).toBe(false);
		expect(hasBearer(withAuth(), "s3cret")).toBe(false);
	});

	test("an empty token matches nothing, not even a bare `Bearer `", () => {
		expect(hasBearer(withAuth("Bearer "), "")).toBe(false);
		expect(hasBearer(withAuth(), "")).toBe(false);
	});
});
