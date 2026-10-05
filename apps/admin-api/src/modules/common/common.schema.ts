import type { TLiteral, TUnion } from "@sinclair/typebox";
import { type Static, type TSchema, t } from "elysia";

export const nullable = <T extends TSchema>(schema: T) =>
	t.Union([schema, t.Null()]);

type Literals<T extends readonly string[]> = {
	-readonly [K in keyof T]: TLiteral<T[K] & string>;
} extends infer R extends TSchema[]
	? R
	: never;

/**
 * String-literal union for use inside `t.Optional`. Not `t.UnionEnum`: there
 * Elysia fills a missing `UnionEnum` field with its first value (verified: an
 * absent `?status=` became "allowed"), which would silently filter lists and
 * flip PATCHed fields. Typed as a tuple, not `TLiteral[]` — Elysia's client
 * types (Eden) lose an array-typed union.
 */
export function oneOf<const T extends readonly string[]>(
	values: T,
): TUnion<Literals<T>> {
	return t.Union(values.map((value) => t.Literal(value))) as unknown as TUnion<
		Literals<T>
	>;
}

/** Loosely typed JSON map (world state, trace payloads). */
export const WorldState = t.Record(
	t.String(),
	t.Union([t.Boolean(), t.Number(), t.String()]),
);

export type WorldState = Static<typeof WorldState>;

export const CallKind = t.UnionEnum([
	"ingest",
	"generate",
	"decision",
	"translate",
	"classify",
]);

/** Optional offset paging; without `pageSize` the whole list comes back. */
export const PageQuery = t.Object({
	page: t.Optional(t.Numeric({ minimum: 1 })),
	pageSize: t.Optional(t.Numeric({ minimum: 1, maximum: 100 })),
});

/**
 * Every non-2xx body. `error` is a stable code the panel localizes
 * (`weak_password`, `last_admin`, …) — the API never returns UI text.
 * `message` is only for upstream failures (orchestrator down or refusing)
 * and is shown as-is.
 */
export const ApiError = t.Object({
	error: t.Optional(t.String()),
	message: t.Optional(t.String()),
	/** Minimum length for `weak_*` codes. */
	min: t.Optional(t.Number()),
	/** Upstream detail kept for humans, not for branching. */
	detail: t.Optional(t.String()),
});

export type CallKind = Static<typeof CallKind>;
export type PageQuery = Static<typeof PageQuery>;
export type ApiError = Static<typeof ApiError>;
