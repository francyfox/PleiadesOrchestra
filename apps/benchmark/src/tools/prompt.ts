import { type ChatMessage, functionCallMessages } from "@repo/core";
import type { Case } from "./cases.ts";
import { describeFields } from "./fields.ts";
import type { ToolSpec } from "./tools.ts";

/**
 * The messages under test: exactly what `delta-function-call` gets for one
 * GOAP step (`functionCallMessages` from @repo/core). `fields` adds the
 * schema spelled out (`describeFields`) after the tool's description — the
 * candidate change, measured here before it goes into core.
 */
export function buildMessages(
	testCase: Case,
	options: { fields?: boolean } = {},
): ChatMessage[] {
	const messages = functionCallMessages({
		tool: testCase.tool,
		facts: testCase.facts,
		lastAnswer: testCase.answer,
		request: testCase.request,
	});
	const fields = options.fields && describeFields(testCase.tool.inputSchema);
	if (!fields) return messages;
	return messages.map((message) => {
		if (message.role !== "user") return message;
		const lines = message.content.split("\n");
		const after = lines.findIndex((l) => l.startsWith("What it does:")) + 1;
		lines.splice(after, 0, fields);
		return { ...message, content: lines.join("\n") };
	});
}

/** `response_format` that makes llama-server constrain decoding to the schema (a grammar). */
export function schemaFormat(tool: ToolSpec) {
	return {
		type: "json_schema" as const,
		json_schema: { name: "arguments", strict: true, schema: tool.inputSchema },
	};
}

/** The model's own function-calling format: the one tool, as the OpenAI `tools` field. */
export function nativeTools(tool: ToolSpec) {
	return [
		{
			type: "function" as const,
			function: {
				name: tool.name,
				description: tool.description,
				parameters: tool.inputSchema,
			},
		},
	];
}
