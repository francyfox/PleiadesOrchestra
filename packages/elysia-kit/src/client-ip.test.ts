import { describe, expect, test } from "bun:test";
import { resolveClientIp } from "./client-ip.ts";

const SOCKET = "172.18.0.5";

function headers(init: Record<string, string>): Headers {
	return new Headers(init);
}

describe("resolveClientIp: socket", () => {
	test("uses the socket address and ignores proxy headers", () => {
		expect(
			resolveClientIp({
				source: "socket",
				hops: 1,
				headers: headers({
					"x-forwarded-for": "1.2.3.4",
					"cf-connecting-ip": "5.6.7.8",
				}),
				socketIp: SOCKET,
			}),
		).toBe(SOCKET);
	});

	test("null when there is no socket address", () => {
		expect(
			resolveClientIp({
				source: "socket",
				hops: 1,
				headers: headers({}),
				socketIp: undefined,
			}),
		).toBeNull();
	});
});

describe("resolveClientIp: cf-connecting-ip", () => {
	test("uses CF-Connecting-IP, not the client-controlled X-Forwarded-For head", () => {
		expect(
			resolveClientIp({
				source: "cf-connecting-ip",
				hops: 1,
				headers: headers({
					"cf-connecting-ip": " 203.0.113.7 ",
					"x-forwarded-for": "6.6.6.6, 203.0.113.7",
				}),
				socketIp: SOCKET,
			}),
		).toBe("203.0.113.7");
	});

	test("falls back to the socket when the header is missing or blank", () => {
		for (const init of [{}, { "cf-connecting-ip": "  " }] as Record<
			string,
			string
		>[]) {
			expect(
				resolveClientIp({
					source: "cf-connecting-ip",
					hops: 1,
					headers: headers(init),
					socketIp: SOCKET,
				}),
			).toBe(SOCKET);
		}
	});
});

describe("resolveClientIp: xff-rightmost", () => {
	test("hops=1 takes the rightmost entry — a spoofed head is ignored", () => {
		expect(
			resolveClientIp({
				source: "xff-rightmost",
				hops: 1,
				headers: headers({ "x-forwarded-for": "1.2.3.99, 198.51.100.4" }),
				socketIp: SOCKET,
			}),
		).toBe("198.51.100.4");
	});

	test("hops=2 skips the one trusted proxy entry on the right", () => {
		expect(
			resolveClientIp({
				source: "xff-rightmost",
				hops: 2,
				headers: headers({
					"x-forwarded-for": "6.6.6.6,198.51.100.4 , 10.0.0.2",
				}),
				socketIp: SOCKET,
			}),
		).toBe("198.51.100.4");
	});

	test("falls back to the socket when the header is missing or too short", () => {
		expect(
			resolveClientIp({
				source: "xff-rightmost",
				hops: 1,
				headers: headers({}),
				socketIp: SOCKET,
			}),
		).toBe(SOCKET);
		expect(
			resolveClientIp({
				source: "xff-rightmost",
				hops: 3,
				headers: headers({ "x-forwarded-for": "1.1.1.1, 2.2.2.2" }),
				socketIp: SOCKET,
			}),
		).toBe(SOCKET);
	});

	test("falls back to the socket when the chosen entry is empty", () => {
		expect(
			resolveClientIp({
				source: "xff-rightmost",
				hops: 1,
				headers: headers({ "x-forwarded-for": "1.1.1.1, " }),
				socketIp: SOCKET,
			}),
		).toBe(SOCKET);
	});
});
