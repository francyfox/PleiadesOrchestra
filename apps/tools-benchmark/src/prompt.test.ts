import { describe, expect, test } from "bun:test";
import { buildCases } from "./cases.ts";
import {
	buildMessages,
	nativeTools,
	SYSTEM_PROMPT,
	SYSTEM_PROMPT_V2,
	schemaFormat,
} from "./prompt.ts";

const [first] = buildCases(["en"]);
if (!first) throw new Error("no cases");

describe("buildMessages", () => {
	test("a system message with the rules, then one user message with tool, facts, answer and request", () => {
		const [system, user, ...rest] = buildMessages(first, "en");
		expect(rest).toHaveLength(0);
		expect(system?.role).toBe("system");
		expect(user?.role).toBe("user");
		expect(user?.content).toContain(`Tool: ${first.tool.name}`);
		expect(user?.content).toContain("Known facts:");
		expect(user?.content).toContain(`Request: ${first.request.en}`);
	});

	test("the request is taken in the language asked for", () => {
		const user = buildMessages(first, "ru")[1];
		expect(user?.content).toContain(`Request: ${first.request.ru}`);
		expect(user?.content).not.toContain(first.request.en);
	});

	test("the last tool answer is included when there is one, and marked absent otherwise", () => {
		const withAnswer = buildCases(["en"]).find((c) => c.answer);
		if (!withAnswer) throw new Error("no case with an answer");
		expect(buildMessages(withAnswer, "en")[1]?.content).toContain(
			withAnswer.answer as string,
		);
		expect(buildMessages(first, "en")[1]?.content).toContain("(none)");
	});
});

describe("prompt versions", () => {
	test("v1 is the default; v2 swaps only the rules", () => {
		const v1 = buildMessages(first, "en");
		const v2 = buildMessages(first, "en", "v2");
		expect(v1[0]?.content).toBe(SYSTEM_PROMPT);
		expect(v2[0]?.content).toBe(SYSTEM_PROMPT_V2);
		expect(v2[1]).toEqual(v1[1]);
	});

	test("the v2 examples don't leak the benchmark's own products", () => {
		for (const word of [
			"cheese",
			"apple",
			"banana",
			"milk",
			"chips",
			"bread",
			"yogurt",
			"pizza",
		]) {
			expect(SYSTEM_PROMPT_V2.toLowerCase()).not.toContain(word);
		}
	});
});

describe("request formats", () => {
	test("schema mode constrains the output to the tool's input schema", () => {
		const format = schemaFormat(first.tool);
		expect(format.type).toBe("json_schema");
		expect(format.json_schema.schema).toBe(first.tool.inputSchema);
	});

	test("native mode offers exactly the one tool", () => {
		const tools = nativeTools(first.tool);
		expect(tools).toHaveLength(1);
		expect(tools[0]?.function.name).toBe(first.tool.name);
		expect(tools[0]?.function.parameters).toBe(first.tool.inputSchema);
	});
});

describe("buildCases", () => {
	test("each spec appears once per language, with unique ids", () => {
		const both = buildCases(["en", "ru"]);
		expect(both.length).toBe(buildCases(["en"]).length * 2);
		expect(new Set(both.map((c) => c.id)).size).toBe(both.length);
	});
});
