import type { CustomersQuery, CustomersSort } from "./api-types";
import { DEFAULT_PAGE_SIZE, parsePage } from "./pagination";

/** `/users` table state, owned by the URL: email search, sort column and order, page. */
export type UsersQuery = CustomersQuery & { page: number; pageSize: number };

const SORTS = [
	"name",
	"email",
	"createdAt",
	"lastActiveAt",
	"channelsCount",
	"balanceUsd",
	"plan",
	"paidUntil",
	"banned",
] as const satisfies readonly CustomersSort[];

export function parseUsersQuery(params: URLSearchParams): UsersQuery {
	const sort = SORTS.find((s) => s === params.get("sort"));
	const order = params.get("order") === "desc" ? "desc" : undefined;
	const q = params.get("q")?.trim() || undefined;
	return {
		page: parsePage(params.get("page")),
		pageSize: DEFAULT_PAGE_SIZE,
		...(q && { q }),
		...(sort && { sort }),
		...(sort && order && { order }),
	};
}

/** The `?search` of `/users` for `query` with `patch` applied (changing search or sort goes back to page 1); the caller wraps `users${…}` in `resolve`. */
export function usersSearch(
	query: UsersQuery,
	patch: Partial<Pick<UsersQuery, "page" | "q" | "sort" | "order">>,
): "" | `?${string}` {
	const next = { ...query, ...patch };
	if (!("page" in patch)) next.page = 1;
	const params = new URLSearchParams();
	if (next.q) params.set("q", next.q);
	if (next.sort) params.set("sort", next.sort);
	if (next.sort && next.order === "desc") params.set("order", "desc");
	if (next.page > 1) params.set("page", String(next.page));
	const search = params.toString();
	return search ? `?${search}` : "";
}
