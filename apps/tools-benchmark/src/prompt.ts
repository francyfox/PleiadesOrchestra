import type { Case, Lang } from "./cases.ts";
import type { ToolSpec } from "./tools.ts";

/**
 * The rules of the job: fill ONE tool call. This is the prompt under test —
 * what `delta-tools` would send once per GOAP step — so it is kept short and
 * free of anything site-specific.
 */
export const SYSTEM_PROMPT = [
	"You fill in the arguments of ONE tool call for an online grocery shop.",
	"Reply with a single JSON object that matches the tool's input schema, nothing else.",
	"Rules:",
	"- Use only what the request, the known facts and the last tool answer say. Never invent values.",
	"- Leave optional fields out unless the request asks for them.",
	"- To add or change a product, copy its exact name from the last tool answer or the known facts; when several fit, take the first one that is in stock and matches the request.",
	"- Search queries are short product words; filters go into their own fields, not into the query.",
	"- Prices are plain numbers in dollars.",
].join("\n");

/** Same job, with a worked example per kind of call and a rule for dishes (v2). */
export const SYSTEM_PROMPT_V2 = [
	"You fill in the arguments of ONE tool call for an online grocery shop.",
	"Reply with a single JSON object that matches the tool's input schema, nothing else.",
	"",
	"Rules:",
	"- Use only what the request, the known facts and the last tool answer say. Never invent values.",
	"- Leave every optional field out unless the request clearly asks for it: no department, no price limit, no diet unless the shopper said so.",
	"- Search `query` is just the product, in singular or plural as said; diets, prices and aisles go in their own fields, never in the query.",
	"- To add a product, copy ONE exact name from the last tool answer or the known facts: the first in-stock one that fits the request. Add several products only if the request names several.",
	"- To change a cart line, use the product from the known facts or the request.",
	"- For a dish: if it is one of the `recipe` values, use only that. Otherwise list the 6-10 grocery items a typical recipe needs in `ingredients`, plain names without amounts.",
	"",
	"Examples (other products):",
	'Request: two lemons, answer lists "- Meyer Lemons — in stock" => {"items":[{"product":"Meyer Lemons","quantity":2}]}',
	'Request: find rice under 3 dollars => {"query":"rice","max_price":3}',
	'Request: vegan sausages => {"query":"sausages","dietary":["vegan"]}',
	'Request: show the frozen aisle => {"department":"Frozen"}',
	'Request: make it 5, fact product "Tofu" => {"product":"Tofu","quantity":5}',
].join("\n");

export type PromptVersion = "v1" | "v2";

export interface Message {
	role: "system" | "user";
	content: string;
}

/** System rules plus one user message: tool, known facts, last answer, request. */
export function buildMessages(
	testCase: Case,
	lang: Lang,
	version: PromptVersion = "v1",
): Message[] {
	const user = [
		`Tool: ${testCase.tool.name}`,
		`What it does: ${testCase.tool.description}`,
		`Known facts: ${JSON.stringify(testCase.facts)}`,
		"Last tool answer:",
		testCase.answer ?? "(none)",
		`Request: ${testCase.request[lang]}`,
	].join("\n");
	return [
		{
			role: "system",
			content: version === "v2" ? SYSTEM_PROMPT_V2 : SYSTEM_PROMPT,
		},
		{ role: "user", content: user },
	];
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
