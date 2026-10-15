import type { DecisionAnswer, DecisionQuestion } from "@repo/core";
import type { ToolSpec } from "../delta/delta.types.ts";

// `--laya`: the fields with a closed answer — a text enum, a boolean — go to
// Laya in one forward pass (all questions batched), the rest to delta field by
// field. In production Laya already picks required enums
// (`createParameterChoiceAction` in @repo/core's webmcp-actions.ts); this
// measures handing it the optional ones and the booleans too.

/** The option of an optional enum that means "leave the field out". */
export const NOT_SAID = "(not said)";

interface Property {
	type?: string;
	enum?: unknown[];
	description?: string;
}

const properties = (tool: ToolSpec) =>
	Object.entries(tool.inputSchema.properties ?? {}) as [string, Property][];

const isTextEnum = (field: Property) =>
	field.type === "string" &&
	(field.enum?.every((value) => typeof value === "string") ?? false);

/** Fields Laya answers: text enums and booleans, in schema order. */
export function layaFields(tool: ToolSpec): string[] {
	return properties(tool)
		.filter(([, field]) => isTextEnum(field) || field.type === "boolean")
		.map(([name]) => name);
}

/**
 * A machine-style value in words (`price_low` → "price low", `newestFirst` →
 * "newest first"): Laya reads the options as text, and a bare `price_low`
 * lost to `price_high` on "cheapest first". Plain words need no description.
 */
export function readable(value: string): string | null {
	const words = value
		.replace(/([a-z])([A-Z])/g, "$1 $2")
		.replace(/[_-]+/g, " ")
		.toLowerCase()
		.trim();
	return words === value.toLowerCase() ? null : words;
}

const about = (field: Property) =>
	field.description ? ` (${field.description})` : "";

export function layaQuestions(
	tool: ToolSpec,
): Record<string, DecisionQuestion> {
	const required = new Set(tool.inputSchema.required ?? []);
	const wanted = new Set(layaFields(tool));
	return Object.fromEntries(
		properties(tool)
			.filter(([name]) => wanted.has(name))
			.map(([name, field]): [string, DecisionQuestion] => {
				if (field.type === "boolean")
					return [
						name,
						{
							type: "boolean",
							instructions: `Does the request ask for this: ${name.replaceAll("_", " ")}${about(field)}?`,
						},
					];
				const criteria: Record<string, string | null> = Object.fromEntries(
					(field.enum as string[]).map((value) => [value, readable(value)]),
				);
				if (!required.has(name))
					criteria[NOT_SAID] = "the request does not say";
				return [
					name,
					{
						type: "choice",
						instructions: `Which ${name.replaceAll("_", " ")} does the request ask for?${about(field)}`,
						criteria,
					},
				];
			}),
	);
}

type Answers = Record<string, DecisionAnswer | undefined>;

/**
 * Laya's answers as arguments. `skip`: fields it judged unsaid, so delta
 * doesn't fill them either. A field without a usable answer is in neither and
 * goes back to delta.
 */
export function layaArguments(
	tool: ToolSpec,
	answers: Answers,
): { args: Record<string, unknown>; skip: string[] } {
	const required = new Set(tool.inputSchema.required ?? []);
	const args: Record<string, unknown> = {};
	const skip: string[] = [];
	for (const [name, field] of properties(tool)) {
		const answer = answers[name];
		if (answer?.type === "boolean") {
			const yes = answer.probability >= 0.5;
			if (yes || required.has(name)) args[name] = yes;
			else skip.push(name);
		} else if (answer?.type === "choice") {
			if (answer.choice === NOT_SAID) skip.push(name);
			else if (field.enum?.includes(answer.choice)) args[name] = answer.choice;
		}
	}
	return { args, skip };
}
