import { type ChatMessage, FUNCTION_CALL_SYSTEM_PROMPT } from "@repo/core";
import type { Case } from "./cases.ts";
import { buildMessages } from "./prompt.ts";
import type { ToolSpec } from "./tools.ts";

/**
 * `--per-field`: the arguments in parts instead of one JSON object. Phase 1
 * asks which optional fields the request gives a value for (a bounded choice
 * — in production that could be Laya's); phase 2 fills each required and each
 * chosen field with its own call, schema = that one field.
 *
 * Measured 2026-10-14 (qwen3-1.7b, delta's cases only): same accuracy as the
 * one-shot call (en 66%), p50 +35%. Phase 1 misjudges fields as often as the
 * one-shot call does, and most remaining misses are about values (one product
 * or two, singular/plural, a recipe's contents), which splitting doesn't fix.
 */

type Schema = ToolSpec["inputSchema"];

const CHOICE_RULES = [
	"You decide which optional fields of ONE tool call to fill.",
	'Reply with a single JSON object {"fill": [field names]}, nothing else.',
	"List a field only when the request, the known facts or the last tool answer clearly give its value. An empty list is fine. Never list a field just because it exists.",
].join("\n");

/** The user message every call starts from: core's, with the fields spelled out. */
function baseMessage(testCase: Case): string {
	return buildMessages(testCase, { fields: true })[1]?.content ?? "";
}

export function optionalFields(tool: ToolSpec): string[] {
	const required = new Set(tool.inputSchema.required ?? []);
	return Object.keys(tool.inputSchema.properties ?? {}).filter(
		(name) => !required.has(name),
	);
}

export function choiceSchema(optional: string[]): Schema {
	return {
		type: "object",
		properties: {
			fill: {
				type: "array",
				items: { type: "string", enum: optional },
				uniqueItems: true,
			},
		},
		required: ["fill"],
	};
}

export function choiceMessages(testCase: Case): ChatMessage[] {
	const optional = optionalFields(testCase.tool).join(", ");
	return [
		{ role: "system", content: CHOICE_RULES },
		{
			role: "user",
			content: `${baseMessage(testCase)}\nOptional fields: ${optional}`,
		},
	];
}

/** Required fields in schema order, then the chosen optional ones. */
export function fieldsToFill(tool: ToolSpec, chosen: string[]): string[] {
	const required = new Set(tool.inputSchema.required ?? []);
	const picked = new Set(chosen);
	const names = Object.keys(tool.inputSchema.properties ?? {});
	return [
		...names.filter((name) => required.has(name)),
		...names.filter((name) => !required.has(name) && picked.has(name)),
	];
}

export function fieldSchema(tool: ToolSpec, name: string): Schema {
	return {
		type: "object",
		properties: { [name]: tool.inputSchema.properties?.[name] },
		required: [name],
	};
}

export function fieldMessages(
	testCase: Case,
	name: string,
	filled: Record<string, unknown>,
): ChatMessage[] {
	return [
		{ role: "system", content: FUNCTION_CALL_SYSTEM_PROMPT },
		{
			role: "user",
			content: `${baseMessage(testCase)}\nAlready filled: ${JSON.stringify(filled)}\nFill only: ${name}`,
		},
	];
}
