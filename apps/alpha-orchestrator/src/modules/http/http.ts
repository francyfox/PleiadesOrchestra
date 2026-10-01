import { t } from "elysia";

/**
 * Enum schema. Not `t.UnionEnum`: inside `t.Optional` Elysia fills a missing
 * `UnionEnum` field with its first value (an absent `?status=` became
 * "allowed"), which would silently filter lists and flip PATCHed fields.
 */
export function oneOf<const T extends string>(values: readonly T[]) {
	return t.Union(values.map((value) => t.Literal(value)));
}

/** Optional offset paging; without `pageSize` the whole list comes back. */
export const PageQuery = t.Object({
	page: t.Optional(t.Numeric({ minimum: 1 })),
	pageSize: t.Optional(t.Numeric({ minimum: 1, maximum: 100 })),
});
