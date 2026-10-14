import { describe, expect, test } from "bun:test";
import { createLoginThrottle } from "./login-throttle.service.ts";

function setup() {
	let clock = 0;
	const throttle = createLoginThrottle(
		{ maxFailuresPerAccount: 3, maxFailuresPerIp: 5, windowMinutes: 10 },
		() => clock,
	);
	return { throttle, advance: (ms: number) => (clock += ms) };
}

describe("login throttle", () => {
	test("locks an account after its failure budget, whatever the IP", () => {
		const { throttle } = setup();
		for (const ip of ["1.1.1.1", "2.2.2.2", "3.3.3.3"]) {
			throttle.loginFailed(ip, "a@x.io");
		}
		expect(throttle.loginRetryAfter("4.4.4.4", "A@x.io ")).toBe(600);
		expect(throttle.loginRetryAfter("4.4.4.4", "b@x.io")).toBe(0);
	});

	test("locks an IP that sprays many accounts", () => {
		const { throttle } = setup();
		for (let i = 0; i < 5; i++) throttle.loginFailed("1.1.1.1", `u${i}@x.io`);
		expect(throttle.loginRetryAfter("1.1.1.1", "fresh@x.io")).toBeGreaterThan(
			0,
		);
		expect(throttle.loginRetryAfter("9.9.9.9", "fresh@x.io")).toBe(0);
	});

	test("the lock ends with the window and success clears the account", () => {
		const { throttle, advance } = setup();
		for (let i = 0; i < 3; i++) throttle.loginFailed("1.1.1.1", "a@x.io");
		advance(601_000);
		expect(throttle.loginRetryAfter("1.1.1.1", "a@x.io")).toBe(0);

		throttle.loginFailed("1.1.1.1", "a@x.io");
		throttle.loginSucceeded("a@x.io");
		for (let i = 0; i < 2; i++) throttle.loginFailed("2.2.2.2", "a@x.io");
		expect(throttle.loginRetryAfter("2.2.2.2", "a@x.io")).toBe(0);
	});

	test("registration is budgeted per IP per hour", () => {
		const { throttle } = setup();
		for (let i = 0; i < 5; i++) {
			expect(throttle.registerAttempt("1.1.1.1")).toBe(0);
		}
		expect(throttle.registerAttempt("1.1.1.1")).toBe(3600);
		expect(throttle.registerAttempt("2.2.2.2")).toBe(0);
	});
});
