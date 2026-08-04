import type { ConsolaReporter, LogObject } from "consola";
import { createConsola, LogLevels } from "consola";

export interface MessageEventFields {
	threadId: string;
	userId: string;
	username?: string;
	messageLength: number;
	latencyMs: number;
	ok: boolean;
}

export interface LlmStateFields {
	provider: string;
	model: string;
	inputTokens?: number;
	outputTokens?: number;
	latencyMs: number;
	ok: boolean;
	error?: string;
}

/** Structured JSON-lines reporter for production — one flat object per line, to stdout. */
export function jsonReporter(): ConsolaReporter {
	return {
		log(logObj: LogObject) {
			const {
				message: _message,
				type: _type,
				tag: _tag,
				args: _args,
				date,
				level,
				...fields
			} = logObj;
			process.stdout.write(
				`${JSON.stringify({ time: date.toISOString(), level, ...fields })}\n`,
			);
		},
	};
}

/**
 * Structured telemetry only — never pass raw message/response content in here.
 * `logMessageEvent` intentionally has no field for it, so there's no accidental path to log it.
 */
export function createTelemetry(
	reporters: ConsolaReporter[] = [jsonReporter()],
) {
	// Explicit level: consola defaults to a lower level under NODE_ENV=test,
	// which would silently drop these calls — telemetry must never depend on that.
	const logger = createConsola({ reporters, level: LogLevels.info });

	return {
		logMessageEvent(fields: MessageEventFields) {
			logger.info({
				message: "message",
				"thread.id": fields.threadId,
				"user.id": fields.userId,
				"user.name": fields.username,
				"message.length": fields.messageLength,
				duration_ms: fields.latencyMs,
				ok: fields.ok,
			});
		},

		logLlmState(fields: LlmStateFields) {
			logger.info({
				message: "llm_call",
				"gen_ai.provider.name": fields.provider,
				"gen_ai.request.model": fields.model,
				"gen_ai.usage.input_tokens": fields.inputTokens,
				"gen_ai.usage.output_tokens": fields.outputTokens,
				duration_ms: fields.latencyMs,
				ok: fields.ok,
				"error.type": fields.error,
			});
		},
	};
}

export const telemetry = createTelemetry();

function sanitizeMetricPart(name: string): string {
	return name.replace(/[^a-zA-Z0-9_]/g, "_");
}

function escapeLabelValue(value: string): string {
	return value
		.replace(/\\/g, "\\\\")
		.replace(/"/g, '\\"')
		.replace(/\n/g, "\\n");
}

/**
 * Pushes telemetry events as Prometheus-format metrics to VictoriaMetrics'
 * `/api/v1/import/prometheus` endpoint. Fire-and-forget: never awaited by the
 * caller and never throws, so an unreachable VM instance can't affect the app.
 */
export function createVictoriaMetricsReporter(
	baseUrl: string,
	fetchImpl: typeof fetch = fetch,
): ConsolaReporter {
	const importUrl = `${baseUrl}/api/v1/import/prometheus`;

	return {
		log(logObj: LogObject) {
			const {
				type: _type,
				tag: _tag,
				args,
				date,
				level: _level,
				...fields
			} = logObj;
			const timestampMs = date.getTime();
			// consola moves the `message` field we log with into args[0] and
			// deletes the original property — see createTelemetry's call sites.
			const eventName = String(args[0] ?? "event");
			const metricPrefix = `albedo_${sanitizeMetricPart(eventName)}`;

			const labels: Record<string, string> = {};
			const metrics: Record<string, number> = {};
			for (const [key, value] of Object.entries(fields)) {
				if (value === undefined) continue;
				const name = sanitizeMetricPart(key);
				if (typeof value === "number") {
					metrics[name] = value;
				} else {
					labels[name] = String(value);
				}
			}

			const metricNames = Object.keys(metrics);
			if (metricNames.length === 0) return;

			const labelString = Object.entries(labels)
				.map(([name, value]) => `${name}="${escapeLabelValue(value)}"`)
				.join(",");

			const lines = metricNames.map(
				(name) =>
					`${metricPrefix}_${name}{${labelString}} ${metrics[name]} ${timestampMs}`,
			);

			fetchImpl(importUrl, {
				method: "POST",
				body: lines.join("\n"),
			}).catch(() => {
				// Swallow: telemetry delivery failures must never surface to the caller.
			});
		},
	};
}
