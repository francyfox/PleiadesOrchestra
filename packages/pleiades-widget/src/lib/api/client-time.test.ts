import { expect, test } from "bun:test";
import { clientTime } from "@/lib/api/client-time.ts";

test("local date, zero-padded, not UTC", () => {
	expect(clientTime(new Date(2026, 0, 5, 23, 59), () => "Asia/Almaty")).toEqual(
		{ clientDate: "2026-01-05", timeZone: "Asia/Almaty" },
	);
	expect(clientTime(new Date(2026, 11, 31, 0, 0), () => "UTC").clientDate).toBe(
		"2026-12-31",
	);
});

test("time zone omitted when empty or throwing", () => {
	expect(clientTime(new Date(2026, 5, 1), () => "")).toEqual({
		clientDate: "2026-06-01",
	});
	expect(
		clientTime(new Date(2026, 5, 1), () => {
			throw new Error("x");
		}),
	).toEqual({ clientDate: "2026-06-01" });
});
