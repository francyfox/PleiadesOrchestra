import { describe, expect, test } from "bun:test";
import { buildConfig } from "./config.ts";

describe("buildConfig", () => {
	test("no DELTA_BASE_URL: the benchmark starts llama-server itself", () => {
		expect(buildConfig({}).DELTA_BASE_URL).toBeUndefined();
		expect(buildConfig({ DELTA_BASE_URL: "" }).DELTA_BASE_URL).toBeUndefined();
	});

	test("DELTA_BASE_URL is the server root, with or without /v1 (as the orchestrator writes it)", () => {
		for (const url of [
			"http://192.168.100.39:8282",
			"http://192.168.100.39:8282/",
			"http://192.168.100.39:8282/v1",
			"http://192.168.100.39:8282/v1/",
		]) {
			expect(buildConfig({ DELTA_BASE_URL: url }).DELTA_BASE_URL).toBe(
				"http://192.168.100.39:8282",
			);
		}
	});

	test("LAYA_BASE_URL is the server root too: the client appends /v1/systemone", () => {
		for (const url of [
			"http://192.168.100.39:8090",
			"http://192.168.100.39:8090/",
			"http://192.168.100.39:8090/v1",
		]) {
			expect(buildConfig({ LAYA_BASE_URL: url }).LAYA_BASE_URL).toBe(
				"http://192.168.100.39:8090",
			);
		}
	});
});
