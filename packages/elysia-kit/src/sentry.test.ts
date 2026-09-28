import { describe, expect, test } from "bun:test";
import { Elysia, t } from "elysia";
import { createMonitoring, type SentryClient } from "./sentry.ts";

function fakeClient() {
	const captured: { error: unknown; tags?: Record<string, string> }[] = [];
	const client: SentryClient = {
		captureException: (error, hint) => {
			captured.push({ error, tags: hint?.tags });
		},
		flush: async () => true,
	};
	return { client, captured };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 5));

describe("createMonitoring", () => {
	test("is a silent no-op without a DSN", async () => {
		const monitoring = createMonitoring({ service: "svc" });
		expect(monitoring.enabled).toBe(false);
		monitoring.capture(new Error("x"));
		await monitoring.flush();
	});

	test("reports server faults with the request's method and path", async () => {
		const { client, captured } = fakeClient();
		const monitoring = createMonitoring({ service: "svc", client });
		const app = new Elysia().use(monitoring.plugin).get("/boom", () => {
			throw new Error("kaput");
		});

		expect(
			(await app.handle(new Request("http://localhost/boom"))).status,
		).toBe(500);
		await settle();
		expect(captured).toHaveLength(1);
		expect(String(captured[0]?.error)).toBe("Error: kaput");
		expect(captured[0]?.tags).toEqual({
			"http.method": "GET",
			"url.path": "/boom",
		});
	});

	test("ignores validation failures and unknown routes", async () => {
		const { client, captured } = fakeClient();
		const app = new Elysia()
			.use(createMonitoring({ service: "svc", client }).plugin)
			.post("/x", () => "ok", { body: t.Object({ a: t.String() }) });

		const invalid = await app.handle(
			new Request("http://localhost/x", {
				method: "POST",
				body: "{}",
				headers: { "content-type": "application/json" },
			}),
		);
		expect(invalid.status).toBe(422);
		expect(
			(await app.handle(new Request("http://localhost/nope"))).status,
		).toBe(404);
		await settle();
		expect(captured).toHaveLength(0);
	});

	test("does not report a custom error the app maps to 4xx", async () => {
		const { client, captured } = fakeClient();
		class Denied extends Error {
			status = 403;
		}
		const app = new Elysia()
			.use(createMonitoring({ service: "svc", client }).plugin)
			.error({ DENIED: Denied })
			.get("/a", () => {
				throw new Denied("no");
			});
		expect((await app.handle(new Request("http://localhost/a"))).status).toBe(
			403,
		);
		await settle();
		expect(captured).toHaveLength(0);
	});
});
