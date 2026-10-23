import { effectsOf, type Taxonomy, type ToolIntent } from "./intent-taxonomy";
import type { WorldState } from "./types";

export interface KnownTool {
	name: string;
	intent: ToolIntent;
}

export interface ToolErrorRecovery {
	/** The tool the site's error names as the missing step. */
	tool: string;
	/** State changes that make the planner run `tool` again before the failed one. */
	facts: Partial<WorldState>;
}

const escapeRegExp = (text: string) =>
	text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * A tool's error that names ANOTHER available tool ("No store is open yet.
 * Call choose_store first with one of: …") tells which precondition the site
 * thinks is missing. The tool is understood by name only, so this works for
 * any site: its intent's effects (`storeOpen`, …) are set to false and its own
 * result facts cleared, and the planner routes through it again before
 * retrying the failed tool. Which option the tool takes stays with the
 * parameter-choice step. No named tool, or one whose intent promises no facts
 * (the planner could not route to it), means no recovery.
 */
export function recoveryFromToolError(
	errorText: string,
	failedTool: string,
	tools: readonly KnownTool[],
	taxonomy?: Taxonomy,
): ToolErrorRecovery | undefined {
	let best: { tool: KnownTool; at: number } | undefined;
	for (const tool of tools) {
		if (tool.name === failedTool) continue;
		const hit = new RegExp(
			`(?<![\\w-])${escapeRegExp(tool.name)}(?![\\w-])`,
		).exec(errorText);
		if (hit && (!best || hit.index < best.at)) best = { tool, at: hit.index };
	}
	if (!best) return undefined;
	const effects = Object.keys(effectsOf(best.tool.intent, taxonomy));
	if (effects.length === 0) return undefined;
	return {
		tool: best.tool.name,
		facts: {
			...Object.fromEntries(effects.map((key) => [key, false])),
			[`toolResult:${best.tool.name}`]: undefined,
			[`webmcp:${best.tool.name}:result`]: undefined,
		},
	};
}
