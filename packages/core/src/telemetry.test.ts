import { describe, expect, test } from "bun:test";
import type { ConsolaReporter, LogObject } from "consola";
import { createTelemetry, createVictoriaMetricsReporter } from "./telemetry";

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

describe("createVictoriaMetricsReporter", () => {
	function fakeFetch(status = 204) {
		const calls: { url: string; body: string; headers: Headers }[] = [];
		const fetchImpl = (async (url: string, init?: RequestInit) => {
			calls.push({
				url,
				body: String(init?.body ?? ""),
				headers: new Headers(init?.headers),
			});
			return new Response(null, { status });
		}) as typeof fetch;
		return { calls, fetchImpl };
	}

	test("posts numeric fields as Prometheus lines to /api/v1/import/prometheus, using string/bool fields as labels", async () => {
		const { calls, fetchImpl } = fakeFetch();
		const reporter = createVictoriaMetricsReporter(
			"http://victoriametrics.railway.internal:8428",
			undefined,
			fetchImpl,
		);
		const telemetry = createTelemetry([reporter]);

		telemetry.logMessageEvent({
			threadId: "chat-1",
			userId: "42",
			username: "francyfox",
			messageLength: 123,
			latencyMs: 456,
			ok: true,
		});

		// Reporter fires the request without awaiting it (telemetry must never
		// block the caller) — flush microtasks before asserting.
		await Promise.resolve();
		await Promise.resolve();

		expect(calls.length).toBe(1);
		expect(calls[0]?.url).toBe(
			"http://victoriametrics.railway.internal:8428/api/v1/import/prometheus",
		);

		const body = calls[0]?.body ?? "";
		expect(body).toContain('thread_id="chat-1"');
		expect(body).toContain('user_id="42"');
		expect(body).toContain('user_name="francyfox"');
		expect(body).toContain('ok="true"');
		expect(body).toMatch(/albedo_message_message_length\{[^}]*\} 123 \d+/);
		expect(body).toMatch(/albedo_message_duration_ms\{[^}]*\} 456 \d+/);
	});

	test("escapes label values containing quotes", async () => {
		const { calls, fetchImpl } = fakeFetch();
		const reporter = createVictoriaMetricsReporter(
			"http://victoriametrics.railway.internal:8428",
			undefined,
			fetchImpl,
		);
		const telemetry = createTelemetry([reporter]);

		telemetry.logMessageEvent({
			threadId: 'chat-"1"',
			userId: "42",
			messageLength: 1,
			latencyMs: 1,
			ok: true,
		});

		await Promise.resolve();
		await Promise.resolve();

		expect(calls[0]?.body).toContain('thread_id="chat-\\"1\\""');
	});

	test("emits no request when an event has no numeric fields", async () => {
		const { calls, fetchImpl } = fakeFetch();
		const reporter = createVictoriaMetricsReporter(
			"http://victoriametrics.railway.internal:8428",
			undefined,
			fetchImpl,
		);

		reporter.log?.(
			{
				message: "empty",
				date: new Date(),
				level: 3,
				type: "info",
				tag: "",
				args: [],
			} as LogObject,
			{ options: {} } as never,
		);

		await Promise.resolve();
		await Promise.resolve();

		expect(calls.length).toBe(0);
	});

	test("sends a Basic Auth header when credentials are provided, omits it otherwise", async () => {
		const { calls, fetchImpl } = fakeFetch();
		const reporter = createVictoriaMetricsReporter(
			"http://victoriametrics.railway.internal:8428",
			{ username: "admin", password: "secret" },
			fetchImpl,
		);
		const telemetry = createTelemetry([reporter]);

		telemetry.logMessageEvent({
			threadId: "chat-1",
			userId: "42",
			messageLength: 1,
			latencyMs: 1,
			ok: true,
		});

		await Promise.resolve();
		await Promise.resolve();

		expect(calls[0]?.headers.get("authorization")).toBe(
			`Basic ${btoa("admin:secret")}`,
		);

		const { calls: callsNoAuth, fetchImpl: fetchImplNoAuth } = fakeFetch();
		const reporterNoAuth = createVictoriaMetricsReporter(
			"http://victoriametrics.railway.internal:8428",
			undefined,
			fetchImplNoAuth,
		);
		createTelemetry([reporterNoAuth]).logMessageEvent({
			threadId: "chat-1",
			userId: "42",
			messageLength: 1,
			latencyMs: 1,
			ok: true,
		});

		await Promise.resolve();
		await Promise.resolve();

		expect(callsNoAuth[0]?.headers.has("authorization")).toBe(false);
	});

	test("logs to console.error when the response is not ok, without throwing", async () => {
		const { fetchImpl } = fakeFetch(401);
		const reporter = createVictoriaMetricsReporter(
			"http://victoriametrics.railway.internal:8428",
			undefined,
			fetchImpl,
		);
		const telemetry = createTelemetry([reporter]);

		const originalConsoleError = console.error;
		const errors: unknown[][] = [];
		console.error = (...args: unknown[]) => {
			errors.push(args);
		};

		try {
			telemetry.logMessageEvent({
				threadId: "chat-1",
				userId: "42",
				messageLength: 1,
				latencyMs: 1,
				ok: true,
			});

			await Promise.resolve();
			await Promise.resolve();
			await Promise.resolve();
		} finally {
			console.error = originalConsoleError;
		}

		expect(errors.length).toBe(1);
		expect(String(errors[0]?.[0])).toContain("401");
	});
});
