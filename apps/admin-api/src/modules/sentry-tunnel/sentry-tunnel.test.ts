import { describe, expect, test } from "bun:test";
import { ORIGIN, testApp } from "../../app.testing.ts";
import { tunnelTarget } from "./sentry-tunnel.service.ts";

const DSN = "https://abc123@o1.ingest.us.sentry.io/42";
const envelope = (dsn: string, item = '{"message":"hi"}') =>
	`${JSON.stringify({ dsn, sent_at: "2026-10-20T00:00:00Z" })}\n{"type":"event"}\n${item}`;

describe("tunnelTarget", () => {
	test("our DSN goes to its project's envelope endpoint", () => {
		expect(tunnelTarget(envelope(DSN), DSN)).toBe(
			"https://o1.ingest.us.sentry.io/api/42/envelope/",
		);
	});

	test("any other DSN, or no readable header, is refused (not an open proxy)", () => {
		for (const other of [
			"https://abc123@o1.ingest.us.sentry.io/43",
			"https://other@o1.ingest.us.sentry.io/42",
			"https://abc123@evil.example/42",
		]) {
			expect(tunnelTarget(envelope(other), DSN)).toBeNull();
		}
		expect(tunnelTarget("not json\n{}", DSN)).toBeNull();
		expect(tunnelTarget('{"sent_at":"x"}\n{}', DSN)).toBeNull();
	});
});

describe("POST /api/monitoring/tunnel", () => {
	function setup(dsn: string | null = DSN) {
		const forwarded: { url: string; body: string }[] = [];
		const t = testApp({
			sentryTunnel: dsn
				? {
						dsn,
						fetch: async (url, init) => {
							forwarded.push({
								url: String(url),
								body: await new Response(init?.body).text(),
							});
							return new Response('{"id":"1"}', { status: 200 });
						},
					}
				: undefined,
		});
		const post = (body: string) =>
			t.app.handle(
				new Request("http://localhost/api/monitoring/tunnel", {
					method: "POST",
					headers: {
						origin: ORIGIN,
						"content-type": "text/plain;charset=UTF-8",
					},
					body,
				}),
			);
		return { post, forwarded };
	}

	test("forwards our envelope byte for byte, without a session", async () => {
		const { post, forwarded } = setup();
		const body = envelope(DSN, '{"message":"привет"}');
		const response = await post(body);
		expect(response.status).toBe(200);
		expect(forwarded).toEqual([
			{ url: "https://o1.ingest.us.sentry.io/api/42/envelope/", body },
		]);
	});

	test("a foreign DSN is 403 and never forwarded", async () => {
		const { post, forwarded } = setup();
		const response = await post(envelope("https://x@evil.example/1"));
		expect(response.status).toBe(403);
		expect(forwarded).toEqual([]);
	});

	test("without a configured DSN the tunnel is off (404)", async () => {
		const { post } = setup(null);
		expect((await post(envelope(DSN))).status).toBe(404);
	});
});
