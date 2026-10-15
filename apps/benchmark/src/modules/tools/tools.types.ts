import type { ToolSpec } from "../delta/delta.types.ts";
import type { Summary } from "../stats/stats.types.ts";

export interface Verdict {
	ok: boolean;
	/** Why it failed, naming the first difference. */
	reason?: string;
}

export type FieldKind = "query" | "keywords" | "enum" | "boolean" | "number";

interface Base {
	/** The words of the request this field comes from (highlighted in the report). */
	source: string;
}

export type FieldCheck = Base &
	(
		| {
				kind: "query";
				/** Each group must appear (any spelling of it). */
				words: string[][];
				/** Search words, not the request retold. */
				maxWords: number;
		  }
		| {
				kind: "keywords";
				/** Each group must appear in some item. None of the words is in the request. */
				mustInclude: string[][];
				maxItems: number;
		  }
		| { kind: "enum"; value: string }
		| { kind: "boolean"; value: boolean }
		| { kind: "number"; value: number }
	);

export interface ComplexCase {
	id: string;
	/** What kind of site: groceries, electronics, … */
	domain: string;
	tool: ToolSpec;
	/** In English, as delta gets it. */
	request: string;
	fields: Record<string, FieldCheck>;
	/** Fields the model may fill or leave out without spoiling the case. */
	free?: string[];
}

export interface FieldResult {
	name: string;
	kind: FieldKind;
	ok: boolean;
	value: unknown;
	reason?: string;
}

export interface Judged {
	fields: FieldResult[];
	/** Filled fields the case doesn't ask for (and doesn't leave free). */
	extra: string[];
	/** Every field right and nothing extra. */
	ok: boolean;
}

export interface ComplexResult extends Judged {
	id: string;
	valid: boolean;
	latencyMs: number;
	promptTokens?: number;
	outputTokens?: number;
	/** Chat completions delta needed for the case. */
	deltaCalls: number;
	/** Laya's share of `latencyMs` (`--laya`). */
	layaMs?: number;
	actual: unknown;
	/** The call itself failed (HTTP, timeout). */
	error?: string;
}

export interface ComplexSummary
	extends Pick<Summary, "cases" | "valid" | "p50Ms" | "p90Ms" | "meanMs"> {
	/** Cases with every field right and nothing extra. */
	allFields: number;
	byKind: Partial<Record<FieldKind, { right: number; total: number }>>;
	meanPromptTokens: number;
	meanOutputTokens: number;
	meanDeltaCalls: number;
	/** Without `--laya`: undefined. */
	meanLayaMs?: number;
}
