import { describe, expect, test } from "bun:test";
import type { ConsolaReporter, LogObject } from "consola";
import { createTelemetry } from "./telemetry";

function fakeReporter() {
	const logs: LogObject[] = [];
	const reporter: ConsolaReporter = {
		log(logObj) {
			logs.push(logObj);
		},
	};
	return { logs, reporter };
}

describe("createTelemetry", () => {
	test("logMessageEvent never includes message content, only metadata", () => {
		const { logs, reporter } = fakeReporter();
		const telemetry = createTelemetry([reporter]);

		telemetry.logMessageEvent({
			threadId: "chat-1",
			userId: "42",
			username: "francyfox",
			messageLength: 123,
			latencyMs: 456,
			ok: true,
		});

		expect(logs.length).toBe(1);
		const entry = logs[0] as LogObject;

		expect(entry["user.id"]).toBe("42");
		expect(entry["user.name"]).toBe("francyfox");
		expect(entry["thread.id"]).toBe("chat-1");
		expect(entry["message.length"]).toBe(123);
		expect(entry.duration_ms).toBe(456);
		expect(entry.ok).toBe(true);

		// The whole point of this event: content is structurally impossible to log.
		expect(JSON.stringify(entry)).not.toContain("content");
	});

	test("logLlmState maps fields to OpenTelemetry GenAI semantic convention names", () => {
		const { logs, reporter } = fakeReporter();
		const telemetry = createTelemetry([reporter]);

		telemetry.logLlmState({
			provider: "albedo",
			model: "vikhr-llama-3.2-1b",
			inputTokens: 42,
			outputTokens: 8,
			latencyMs: 900,
			ok: true,
		});

		const entry = logs[0] as LogObject;
		expect(entry["gen_ai.provider.name"]).toBe("albedo");
		expect(entry["gen_ai.request.model"]).toBe("vikhr-llama-3.2-1b");
		expect(entry["gen_ai.usage.input_tokens"]).toBe(42);
		expect(entry["gen_ai.usage.output_tokens"]).toBe(8);
		expect(entry.duration_ms).toBe(900);
	});

	test("logLlmState includes error.type when the call failed", () => {
		const { logs, reporter } = fakeReporter();
		const telemetry = createTelemetry([reporter]);

		telemetry.logLlmState({
			provider: "albedo",
			model: "vikhr-llama-3.2-1b",
			latencyMs: 30000,
			ok: false,
			error: "timeout",
		});

		const entry = logs[0] as LogObject;
		expect(entry.ok).toBe(false);
		expect(entry["error.type"]).toBe("timeout");
	});
});
