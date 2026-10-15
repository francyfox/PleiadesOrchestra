import { functionCallMessages } from "@repo/core";
import { describeFields } from "./delta.fields.ts";
import type { Case } from "./delta.types.ts";

/**
 * The user message every per-field call starts from: exactly what
 * `delta-function-call` gets for one GOAP step (`functionCallMessages` from
 * @repo/core), with the schema spelled out (`describeFields`) after the tool's
 * description — delta sees the schema only as a grammar otherwise.
 */
export function baseMessage(testCase: Case): string {
	const user =
		functionCallMessages({
			tool: testCase.tool,
			facts: testCase.facts,
			lastAnswer: testCase.answer,
			request: testCase.request,
		}).find((message) => message.role === "user")?.content ?? "";
	const fields = describeFields(testCase.tool.inputSchema);
	if (!fields) return user;
	const lines = user.split("\n");
	const after = lines.findIndex((l) => l.startsWith("What it does:")) + 1;
	lines.splice(after, 0, fields);
	return lines.join("\n");
}
