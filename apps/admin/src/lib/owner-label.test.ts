import { expect, test } from "bun:test";
import { ownerLabel } from "./owner-label";

const accounts = [{ id: "a1", name: "Ann", email: "ann@example.com" }];

test("staff-owned channel has no label", () => {
	expect(ownerLabel(null, accounts)).toBeNull();
});

test("a known owner shows name and email, an unknown one its id", () => {
	expect(ownerLabel("a1", accounts)).toEqual({
		name: "Ann",
		email: "ann@example.com",
	});
	expect(ownerLabel("gone", accounts)).toEqual({ name: "gone", email: null });
});
