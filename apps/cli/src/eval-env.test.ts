import { describe, expect, test } from "bun:test";
import { evalEnv, findCore } from "./eval-env.ts";

describe("findCore", () => {
	test("found from any directory of the checkout, nothing outside it", async () => {
		const exists = async (path: string) =>
			path === "/repo/packages/core/eval/intents.ts";
		expect(await findCore("/repo/apps/cli", exists)).toBe(
			"/repo/packages/core/",
		);
		expect(await findCore("/repo", exists)).toBe("/repo/packages/core/");
		expect(await findCore("/elsewhere", exists)).toBeUndefined();
	});
});

describe("evalEnv", () => {
	const settings = {
		decision: {
			baseUrl: "https://openrouter.ai/api/alpha/decisions",
			apiKey: "sk-d",
			model: "liquid/d1-ultra",
			extraBody: {},
		},
		functionCall: {
			baseUrl: "http://ollama:11434/v1",
			apiKey: "",
			model: "qwen3:1.7b-q8_0",
			reasoningEffort: "none",
			extraBody: {},
		},
		understand: {
			baseUrl: "https://openrouter.ai/api/v1",
			apiKey: "sk-u",
			model: "mistralai/voxtral-small-24b-2507",
			extraBody: {},
		},
	};

	test("the service's models become the evals' env; the last line is the answer", () => {
		expect(evalEnv(`a log line\n${JSON.stringify(settings)}\n`)).toEqual({
			DECISION_BASE_URL: "https://openrouter.ai/api/alpha/decisions",
			DECISION_API_KEY: "sk-d",
			DECISION_MODEL: "liquid/d1-ultra",
			FUNCTION_CALL_BASE_URL: "http://ollama:11434/v1",
			FUNCTION_CALL_API_KEY: "",
			FUNCTION_CALL_MODEL: "qwen3:1.7b-q8_0",
			FUNCTION_CALL_REASONING_EFFORT: "none",
			UNDERSTAND_BASE_URL: "https://openrouter.ai/api/v1",
			UNDERSTAND_API_KEY: "sk-u",
			UNDERSTAND_MODEL: "mistralai/voxtral-small-24b-2507",
		});
	});

	test("no reasoning effort, no variable", () => {
		const { reasoningEffort: _, ...plain } = settings.functionCall;
		expect(
			evalEnv(JSON.stringify({ ...settings, functionCall: plain })),
		).not.toHaveProperty("FUNCTION_CALL_REASONING_EFFORT");
	});

	test("an answer that is not the settings is an error, not empty env", () => {
		expect(() => evalEnv("Error: no such command\n")).toThrow();
	});
});
