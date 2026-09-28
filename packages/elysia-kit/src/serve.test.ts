import { describe, expect, test } from "bun:test";
import { EventEmitter } from "node:events";
import type { Observability } from "./app.ts";
import { createLogger, jsonReporter } from "./logger.ts";
import { createMonitoring } from "./sentry.ts";
import { handleProcessLifecycle } from "./serve.ts";

function setup() {
	const lines: Record<string, unknown>[] = [];
	const captured: unknown[] = [];
	const observability: Observability = {
		service: "svc",
		logger: createLogger({
			service: "svc",
			reporters: [jsonReporter((line) => lines.push(JSON.parse(line)))],
		}),
		monitoring: createMonitoring({
			service: "svc",
			client: {
				captureException: (error) => {
					captured.push(error);
				},
				flush: async () => true,
			},
		}),
	};
	const proc = Object.assign(new EventEmitter(), {
		exit: (_code?: number) => undefined as never,
	});
	return { lines, captured, observability, proc };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 5));

describe("handleProcessLifecycle", () => {
	test("on SIGTERM stops the server, releases resources, then exits 0", async () => {
		const { observability, proc } = setup();
		const order: string[] = [];
		proc.exit = ((code?: number) => {
			order.push(`exit:${code}`);
			return undefined as never;
		}) as typeof proc.exit;
		handleProcessLifecycle({
			observability,
			process: proc,
			stop: () => order.push("stop"),
			onShutdown: () => order.push("release"),
		});
		proc.emit("SIGTERM");
		await settle();
		expect(order).toEqual(["stop", "release", "exit:0"]);
	});

	test("logs and reports uncaught errors without exiting", async () => {
		const { observability, proc, lines, captured } = setup();
		let exited = false;
		proc.exit = (() => {
			exited = true;
			return undefined as never;
		}) as typeof proc.exit;
		handleProcessLifecycle({ observability, process: proc, stop: () => {} });
		proc.emit("uncaughtException", new Error("late"));
		await settle();
		expect(exited).toBe(false);
		expect(lines.find((l) => l.message === "uncaught_exception")).toMatchObject(
			{
				"error.message": "late",
			},
		);
		expect(captured).toHaveLength(1);
	});
});
