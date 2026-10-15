import { type ChatMessage, FUNCTION_CALL_SYSTEM_PROMPT } from "@repo/core";
import { baseMessage } from "./delta.prompt.ts";
import type { Case, ToolSpec } from "./delta.types.ts";

/**
 * The arguments in parts instead of one JSON object. Phase 1 asks which
 * optional fields the request gives a value for; phase 2 fills each required
 * and each chosen field with its own call, schema = that one field. Fields in
 * `skip` are decided elsewhere (`--laya`: enums and booleans) and left out of
 * both phases.
 *
 * Measured 2026-10-15 (qwen3-1.7b-q8_0 on Ollama, the complex cases): enum
 * 17% → 100%, boolean 40% → 80%, number 75% → 100% against one JSON object
 * for the whole call; keywords chosen by meaning stay at 0% either way.
 */

type Schema = ToolSpec["inputSchema"];

const CHOICE_RULES = [
	"You decide which optional fields of ONE tool call to fill.",
	'Reply with a single JSON object {"fill": [field names]}, nothing else.',
	"List a field only when the request, the known facts or the last tool answer clearly give its value. An empty list is fine. Never list a field just because it exists.",
].join("\n");

export function optionalFields(tool: ToolSpec, skip: string[] = []): string[] {
	const required = new Set(tool.inputSchema.required ?? []);
	return Object.keys(tool.inputSchema.properties ?? {}).filter(
		(name) => !required.has(name) && !skip.includes(name),
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

export function choiceMessages(
	testCase: Case,
	skip: string[] = [],
): ChatMessage[] {
	const optional = optionalFields(testCase.tool, skip).join(", ");
	return [
		{ role: "system", content: CHOICE_RULES },
		{
			role: "user",
			content: `${baseMessage(testCase)}\nOptional fields: ${optional}`,
		},
	];
}

/** Required fields in schema order, then the chosen optional ones. */
export function fieldsToFill(
	tool: ToolSpec,
	chosen: string[],
	skip: string[] = [],
): string[] {
	const required = new Set(tool.inputSchema.required ?? []);
	const picked = new Set(chosen);
	const names = Object.keys(tool.inputSchema.properties ?? {}).filter(
		(name) => !skip.includes(name),
	);
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
