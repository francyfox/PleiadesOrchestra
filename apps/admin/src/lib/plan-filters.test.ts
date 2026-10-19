import { expect, test } from "bun:test";
import { parsePlanStatus } from "./plan-filters";

test("parsePlanStatus keeps a known status, anything else means all", () => {
	expect(parsePlanStatus("past_due")).toBe("past_due");
	expect(parsePlanStatus("nope")).toBeUndefined();
	expect(parsePlanStatus(null)).toBeUndefined();
});
