import type { Case } from "./cases.ts";
import type { ToolSpec } from "./tools.ts";

/**
 * Required parameters with a fixed list of values. In production these never
 * reach delta's answer: GOAP gives each one its own Laya step (a bounded
 * choice, `createParameterChoiceAction` in @repo/core's webmcp-actions.ts) —
 * same rule as its `requiredEnumParameters`.
 */
export function layaFields(tool: ToolSpec): string[] {
	const { properties = {}, required = [] } = tool.inputSchema;
	return required.filter((name) => {
		const values = (properties[name] as { enum?: unknown[] } | undefined)?.enum;
		return values?.some((value) => typeof value === "string") ?? false;
	});
}

/** Cases that are delta's job: not every expected field is one Laya picks. */
export function deltaCases(cases: Case[]): Case[] {
	return cases.filter((testCase) => {
		const laya = new Set(layaFields(testCase.tool));
		const keys = Object.keys(testCase.expected);
		return keys.length === 0 || !keys.every((key) => laya.has(key));
	});
}
