import { describe, expect, test } from "bun:test";
import { call, useHarness } from "./app.harness.testing.ts";

useHarness();

describe("docs", () => {
	test("/health is open and Swagger documents the API", async () => {
		expect((await call("/health", { origin: null })).status).toBe(200);
		const spec = await (await call("/api/docs/json", { origin: null })).json();
		expect(Object.keys(spec.paths)).toEqual(
			expect.arrayContaining([
				"/api/session",
				"/api/users",
				"/api/channels",
				"/api/system",
			]),
		);
	});
});
