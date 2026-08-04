import { describe, expect, test } from "bun:test";
import { buildConfig } from "./config.ts";

const validEnv = {
	TELEGRAM_TOKEN: "123:abc",
	ALLOWED_TELEGRAM_USER_IDS: "1,2,3",
	LLM_BASE_URL: "https://example.com/v1",
	LLM_API_KEY: "key",
	TELEGRAM_WEBHOOK_URL: "https://example.com/webhook",
	TELEGRAM_WEBHOOK_SECRET: "secret",
};

describe("buildConfig", () => {
	// The only actual logic here — everything else is zod's own validation
	// (required fields, .url(), .default()), not worth re-testing.
	test("parses ALLOWED_TELEGRAM_USER_IDS into a number array", () => {
		const config = buildConfig(validEnv);
		expect(config.ALLOWED_TELEGRAM_USER_IDS).toEqual([1, 2, 3]);
	});
});
