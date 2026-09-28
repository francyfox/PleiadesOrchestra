import { describe, expect, test } from "bun:test";
import { whoisUrl } from "./ip";

describe("whoisUrl", () => {
	test("links an IPv4 address to its ipinfo.io page", () => {
		expect(whoisUrl("203.0.113.7")).toBe("https://ipinfo.io/203.0.113.7");
	});

	test("percent-encodes an IPv6 address", () => {
		expect(whoisUrl("2001:db8::1")).toBe("https://ipinfo.io/2001%3Adb8%3A%3A1");
	});
});
