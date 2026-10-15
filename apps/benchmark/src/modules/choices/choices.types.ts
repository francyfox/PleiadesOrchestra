import type { DecisionAnswer } from "@repo/core";
import type { ToolSpec } from "../delta/delta.types.ts";

/**
 * What a field should come out as: a value the request gives, `null` when the
 * request says nothing about it (left out), `false` for a flag the request
 * turns down ("skip the t-shirt") — left out or `false`, both fine.
 */
export type Expected = string | boolean | null;

export type Category = "given" | "unsaid" | "refused";

export type Kind = "enum" | "boolean";

export interface FieldVerdict {
	name: string;
	kind: Kind;
	category: Category;
	ok: boolean;
	expected: Expected;
	actual: unknown;
	/** wrong: another value; invented: filled though not asked; left out: asked but missing. */
	miss?: "wrong" | "invented" | "left out";
}

export interface LayaResult {
	id: string;
	latencyMs: number;
	/** Laya's raw answers, probabilities included (to tune thresholds later). */
	answers: Record<string, DecisionAnswer>;
	actual: Record<string, unknown>;
	fields: FieldVerdict[];
	error?: string;
}

export interface Tally {
	right: number;
	total: number;
}

export interface LayaSummary {
	requests: number;
	decisions: Tally;
	/** Requests with every field right. */
	allRight: number;
	byKind: Partial<Record<Kind, Tally>>;
	byCategory: Partial<Record<Category, Tally>>;
	p50Ms: number;
	p90Ms: number;
	meanMs: number;
}

export interface LayaCase {
	id: string;
	domain: string;
	tool: ToolSpec;
	request: string;
	/** Every enum and boolean field of the tool. */
	expected: Record<string, Expected>;
}
