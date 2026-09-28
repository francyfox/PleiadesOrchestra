import { describe, expect, test } from "bun:test";
import { Elysia } from "elysia";
import { hasBearer, onRequestGuard } from "./guard.ts";
import { createLogger, jsonReporter } from "./logger.ts";
import { requestLog } from "./request-log.ts";

function memory() {
	const lines: Record<string, unknown>[] = [];
	const reporter = jsonReporter((line) => {
		lines.push(JSON.parse(line));
	});
	return {
		lines,
		logger: createLogger({ service: "test", reporters: [reporter] }),
	};
}

/** `onAfterResponse` runs just after the response is handed back. */
const afterResponse = () => new Promise((resolve) => setTimeout(resolve, 5));

describe("requestLog", () => {
	test("logs method, path, status and duration — never the query or body", async () => {
		const { lines, logger } = memory();
		const app = new Elysia()
			.use(requestLog({ logger }))
			.post("/echo", ({ body }) => body);

		const response = await app.handle(
			new Request("http://localhost/echo?token=secret", {
				method: "POST",
				body: JSON.stringify({ password: "hunter2" }),
				headers: { "content-type": "application/json" },
			}),
		);
		expect(response.status).toBe(200);
		expect(response.headers.get("x-request-id")).toBeTruthy();
		await afterResponse();

		expect(lines).toHaveLength(1);
		expect(lines[0]).toMatchObject({
			message: "http_request",
			"service.name": "test",
			"http.request.method": "POST",
			"url.path": "/echo",
			"http.response.status_code": 200,
		});
		expect(JSON.stringify(lines)).not.toContain("secret");
		expect(JSON.stringify(lines)).not.toContain("hunter2");
	});

	test("also logs requests a later onRequest hook rejects", async () => {
		const { lines, logger } = memory();
		const app = new Elysia()
			.use(requestLog({ logger }))
			.onRequest(
				onRequestGuard(logger, (request) =>
					hasBearer(request, "k")
						? undefined
						: { status: 401, body: "Unauthorized" },
				),
			)
			.get("/secret", () => "no");

		const response = await app.handle(new Request("http://localhost/secret"));
		expect(response.status).toBe(401);
		await afterResponse();
		expect(await response.text()).toBe("Unauthorized");
		expect(lines).toHaveLength(1);
		expect(lines[0]).toMatchObject({
			message: "http_request",
			"http.response.status_code": 401,
			"url.path": "/secret",
		});
	});

	test("keeps a caller-supplied request id", async () => {
		const { lines, logger } = memory();
		const app = new Elysia().use(requestLog({ logger })).get("/a", () => "ok");
		const response = await app.handle(
			new Request("http://localhost/a", {
				headers: { "x-request-id": "abc-123" },
			}),
		);
		expect(response.headers.get("x-request-id")).toBe("abc-123");
		await afterResponse();
		expect(lines[0]).toMatchObject({ "request.id": "abc-123" });
	});

	test("skips /health and logs unhandled errors with a stack", async () => {
		const { lines, logger } = memory();
		const app = new Elysia()
			.use(requestLog({ logger }))
			.get("/health", () => "ok")
			.get("/boom", () => {
				throw new Error("kaput");
			});

		await app.handle(new Request("http://localhost/health"));
		await afterResponse();
		expect(lines).toHaveLength(0);

		const response = await app.handle(new Request("http://localhost/boom"));
		expect(response.status).toBe(500);
		await afterResponse();
		const error = lines.find((l) => l.message === "unhandled_error");
		expect(error).toMatchObject({
			"error.message": "kaput",
			"url.path": "/boom",
		});
		expect(String(error?.["error.stack"])).toContain("kaput");
		expect(lines.find((l) => l.message === "http_request")).toMatchObject({
			"http.response.status_code": 500,
		});
	});

	test("does not report validation failures as incidents", async () => {
		const { lines, logger } = memory();
		const { t } = await import("elysia");
		const app = new Elysia()
			.use(requestLog({ logger }))
			.post("/x", () => "ok", { body: t.Object({ a: t.String() }) });
		const response = await app.handle(
			new Request("http://localhost/x", {
				method: "POST",
				body: "{}",
				headers: { "content-type": "application/json" },
			}),
		);
		expect(response.status).toBe(422);
		await afterResponse();
		expect(lines.some((l) => l.message === "unhandled_error")).toBe(false);
	});
});

describe("jsonReporter", () => {
	test("writes one flat JSON object per line", () => {
		const out: string[] = [];
		const logger = createLogger({
			service: "svc",
			reporters: [jsonReporter((l) => out.push(l))],
		});
		logger.info({ message: "evt", "a.b": 1 });
		const parsed = JSON.parse(out[0] ?? "");
		expect(parsed).toMatchObject({
			message: "evt",
			"a.b": 1,
			"service.name": "svc",
		});
		expect(out[0]?.endsWith("\n")).toBe(true);
		expect(typeof parsed.time).toBe("string");
	});
});
