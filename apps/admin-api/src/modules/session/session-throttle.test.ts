import { describe, expect, test } from "bun:test";
import { PASSWORD, testApp } from "../../app.testing.ts";

const EMAIL = "root@example.com";

function login(
	t: ReturnType<typeof testApp>,
	password: string,
	headers: Record<string, string> = {},
	email = EMAIL,
) {
	return t.app.handle(
		new Request("http://localhost/api/auth/login", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				origin: "http://localhost:3002",
				...headers,
			},
			body: JSON.stringify({ email, password }),
		}),
	);
}

describe("login brute-force protection", () => {
	test("locks the account with 429 + Retry-After; a spoofed X-Forwarded-For doesn't help", async () => {
		const t = testApp({
			loginLimits: { maxFailuresPerAccount: 3 },
		});
		await t.registerFirst();

		for (let i = 0; i < 3; i++) {
			const bad = await login(t, "wrong-password-1", {
				"x-forwarded-for": `10.0.0.${i}`,
			});
			expect(bad.status).toBe(400);
		}
		const locked = await login(t, PASSWORD, { "x-forwarded-for": "10.9.9.9" });
		expect(locked.status).toBe(429);
		expect(Number(locked.headers.get("retry-after"))).toBeGreaterThan(0);
		const body = (await locked.json()) as { error: string; retryAfter: number };
		expect(body.error).toBe("too_many_attempts");
		expect(body.retryAfter).toBeGreaterThan(0);
	});

	test("with source=socket every request shares one IP bucket regardless of headers", async () => {
		const t = testApp({
			loginLimits: { maxFailuresPerIp: 2, maxFailuresPerAccount: 100 },
		});
		await t.registerFirst();

		for (let i = 0; i < 2; i++) {
			await login(
				t,
				"wrong-password-1",
				{ "x-forwarded-for": `10.0.0.${i}` },
				`u${i}@x.io`,
			);
		}
		const next = await login(
			t,
			"wrong-password-1",
			{ "x-forwarded-for": "10.0.0.99" },
			"u9@x.io",
		);
		expect(next.status).toBe(429);
	});

	test("with xff-rightmost the trusted hop is the key, the spoofable head is ignored", async () => {
		const t = testApp({
			clientIp: { source: "xff-rightmost", hops: 1 },
			loginLimits: { maxFailuresPerIp: 2, maxFailuresPerAccount: 100 },
		});
		await t.registerFirst();

		for (const head of ["1.1.1.1", "2.2.2.2"]) {
			await login(t, "wrong-password-1", {
				"x-forwarded-for": `${head}, 7.7.7.7`,
			});
		}
		const sameProxyHop = await login(t, "wrong-password-1", {
			"x-forwarded-for": "3.3.3.3, 7.7.7.7",
		});
		expect(sameProxyHop.status).toBe(429);
		const otherClient = await login(t, PASSWORD, {
			"x-forwarded-for": "3.3.3.3, 8.8.8.8",
		});
		expect(otherClient.status).toBe(200);
	});

	test("a successful login still works under budget and the session stores the trusted IP", async () => {
		const t = testApp({ clientIp: { source: "xff-rightmost", hops: 1 } });
		await t.registerFirst();
		const response = await login(t, PASSWORD, {
			"x-forwarded-for": "6.6.6.6, 8.8.8.8",
		});
		expect(response.status).toBe(200);
		const row = t.db.$client
			.query("select ip_address from session order by created_at desc limit 1")
			.get() as { ip_address: string };
		expect(row.ip_address).toBe("8.8.8.8");
	});

	test("registration attempts are budgeted per IP", async () => {
		const t = testApp({ loginLimits: { maxRegistrationsPerIpPerHour: 2 } });
		const attempt = () =>
			t.call("/api/auth/register", {
				method: "POST",
				body: { email: "a@x.io", password: "short" },
			});
		expect((await attempt()).status).toBe(400);
		expect((await attempt()).status).toBe(400);
		expect((await attempt()).status).toBe(429);
	});
});
