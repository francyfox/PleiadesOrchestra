import { describe, expect, test } from "bun:test";
import { FUNCTION_CALL_SYSTEM_PROMPT, functionCallMessages } from "@repo/core";
import { buildCases } from "./cases.ts";
import { describeFields } from "./fields.ts";
import { buildMessages, nativeTools, schemaFormat } from "./prompt.ts";

const [first] = buildCases();
if (!first) throw new Error("no cases");

describe("buildMessages", () => {
	test("sends what delta gets in production: the @repo/core messages", () => {
		const messages = buildMessages(first);
		expect(messages).toEqual(
			functionCallMessages({
				tool: first.tool,
				facts: first.facts,
				lastAnswer: first.answer,
				request: first.request,
			}),
		);
		expect(messages[0]?.content).toBe(FUNCTION_CALL_SYSTEM_PROMPT);
	});

	test("the request goes in as written", () => {
		const user = buildMessages(first)[1];
		expect(user?.content).toContain(`Request: ${first.request}`);
	});

	test("the last tool answer is included when there is one, and marked absent otherwise", () => {
		const withAnswer = buildCases().find((c) => c.answer);
		if (!withAnswer) throw new Error("no case with an answer");
		expect(buildMessages(withAnswer)[1]?.content).toContain(
			withAnswer.answer as string,
		);
		expect(buildMessages(first)[1]?.content).toContain("(none)");
	});
});

describe("fields block (--fields)", () => {
	const withFields = buildCases().find(
		(c) => c.tool.name === "add_recipe_to_cart",
	);
	if (!withFields) throw new Error("no add_recipe_to_cart case");

	test("spells out the schema right after the tool's description; the rest stays as core sends it", () => {
		const plain = buildMessages(withFields);
		const [system, user] = buildMessages(withFields, { fields: true });
		expect(system).toEqual(plain[0]);
		const lines = (plain[1]?.content ?? "").split("\n");
		const after = lines.findIndex((l) => l.startsWith("What it does:")) + 1;
		lines.splice(after, 0, describeFields(withFields.tool.inputSchema));
		expect(user?.content).toBe(lines.join("\n"));
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
	test("one case per spec, with unique ids", () => {
		const cases = buildCases();
		expect(new Set(cases.map((c) => c.id)).size).toBe(cases.length);
	});
});
