import { expect, test } from "bun:test";
import { assertRetentionCoversHistory } from "./retention.ts";

test("passes when per-user retention covers the agent's history window", () => {
	expect(() => assertRetentionCoversHistory(10, 10)).not.toThrow();
});

test("throws when retention would drop messages the model still expects as context", () => {
	expect(() => assertRetentionCoversHistory(5, 10)).toThrow(
		/MESSAGE_RETENTION_PER_USER/,
	);
});
