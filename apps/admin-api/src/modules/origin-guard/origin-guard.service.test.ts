import { describe, expect, test } from "bun:test";
import {
	foreignOriginRejection,
	isForeignOrigin,
} from "./origin-guard.service.ts";

const TRUSTED = ["http://localhost:3002"];
const request = (method: string, origin?: string) =>
	new Request("http://localhost/api/x", {
		method,
		headers: origin ? { origin } : {},
	});

describe("isForeignOrigin", () => {
	test("no Origin header is not foreign (curl, server-to-server)", () => {
		expect(isForeignOrigin(request("POST"), TRUSTED)).toBe(false);
	});

	test("a listed origin is fine, an unlisted one is foreign", () => {
		expect(isForeignOrigin(request("POST", TRUSTED[0]), TRUSTED)).toBe(false);
		expect(
			isForeignOrigin(request("POST", "http://evil.example"), TRUSTED),
		).toBe(true);
	});

	test("localhost and 127.0.0.1 are different origins", () => {
		expect(
			isForeignOrigin(request("POST", "http://127.0.0.1:3002"), TRUSTED),
		).toBe(true);
	});
});

describe("foreignOriginRejection", () => {
	const decide = foreignOriginRejection(TRUSTED);

	test("only state-changing methods are checked", () => {
		expect(decide(request("GET", "http://evil.example"))).toBeUndefined();
		expect(decide(request("POST", "http://evil.example"))).toEqual({
			status: 403,
			body: "Forbidden origin",
		});
	});
});
