import { describe, expect, test } from "bun:test";
import { recordCall } from "./record-call";
import type { LlmCallRecord } from "./types";

const call: LlmCallRecord = {
	threadId: "t",
	userId: "u",
	planRunId: "r1",
	actionName: "translate",
	kind: "translate",
	provider: "ctranslate2",
	model: "opus-mt-ru-en",
	latencyMs: 42,
	ok: true,
	at: 1000,
};

describe("recordCall", () => {
	test("hands the call to the usage recorder unchanged", () => {
		const recorded: LlmCallRecord[] = [];
		recordCall({ record: (c) => recorded.push(c) }, call);
		expect(recorded).toEqual([call]);
	});

	test("works without a recorder (telemetry only)", () => {
		expect(() => recordCall(undefined, call)).not.toThrow();
	});
});
