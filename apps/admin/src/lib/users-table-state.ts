import type {
	SortOrder,
	UserKind,
	UserStatus,
	UsersQuery,
	UsersSort,
} from "./api-types";

/**
 * `/users` table state, owned by the URL (server-side filtering, sorting and
 * cursor paging). The orchestrator only pages forward, so `trail` keeps the
 * cursors of earlier pages to make "back" possible; `""` stands for page one.
 */
export interface UsersTableState {
	channel?: string;
	kind?: UserKind;
	status?: UserStatus;
	q?: string;
	sort: UsersSort;
	order: SortOrder;
	limit: number;
	cursor?: string;
	trail: string[];
}

export interface SortingEntry {
	id: string;
	desc: boolean;
}

const DEFAULT_SORT: UsersSort = "lastSeenAt";
const DEFAULT_ORDER: SortOrder = "desc";
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

const KINDS: readonly UserKind[] = ["identified", "anonymous"];
const STATUSES: readonly UserStatus[] = ["allowed", "pending", "blocked"];
const SORTS: readonly UsersSort[] = ["lastSeenAt", "createdAt", "tokens"];
const ORDERS: readonly SortOrder[] = ["asc", "desc"];

function oneOf<T extends string>(
	values: readonly T[],
	value: string | null,
): T | undefined {
	return values.find((candidate) => candidate === value);
}

function nonEmpty(value: string | null): string | undefined {
	return value ? value : undefined;
}

function parseLimit(value: string | null): number {
	const parsed = Number.parseInt(value ?? "", 10);
	if (Number.isNaN(parsed)) return DEFAULT_LIMIT;
	return Math.min(MAX_LIMIT, Math.max(1, parsed));
}

/** Drops keys whose value is `undefined`, so states compare structurally. */
function compact(state: UsersTableState): UsersTableState {
	return Object.fromEntries(
		Object.entries(state).filter(([, value]) => value !== undefined),
	) as unknown as UsersTableState;
}

export function parseUsersState(params: URLSearchParams): UsersTableState {
	const trail = params.get("trail");
	return compact({
		channel: nonEmpty(params.get("channel")),
		kind: oneOf(KINDS, params.get("kind")),
		status: oneOf(STATUSES, params.get("status")),
		q: nonEmpty(params.get("q")),
		sort: oneOf(SORTS, params.get("sort")) ?? DEFAULT_SORT,
		order: oneOf(ORDERS, params.get("order")) ?? DEFAULT_ORDER,
		limit: parseLimit(params.get("limit")),
		cursor: nonEmpty(params.get("cursor")),
		trail: trail === null ? [] : trail.split(","),
	});
}

export function usersStateToSearch(state: UsersTableState): URLSearchParams {
	const params = new URLSearchParams();
	if (state.channel) params.set("channel", state.channel);
	if (state.kind) params.set("kind", state.kind);
	if (state.status) params.set("status", state.status);
	if (state.q) params.set("q", state.q);
	if (state.sort !== DEFAULT_SORT) params.set("sort", state.sort);
	if (state.order !== DEFAULT_ORDER) params.set("order", state.order);
	if (state.limit !== DEFAULT_LIMIT) params.set("limit", String(state.limit));
	if (state.cursor) params.set("cursor", state.cursor);
	if (state.trail.length > 0) params.set("trail", state.trail.join(","));
	return params;
}

export function toUsersQuery(state: UsersTableState): UsersQuery {
	const { trail: _trail, ...query } = state;
	return query;
}

export function nextPage(
	state: UsersTableState,
	nextCursor: string,
): UsersTableState {
	return {
		...state,
		cursor: nextCursor,
		trail: [...state.trail, state.cursor ?? ""],
	};
}

export function prevPage(state: UsersTableState): UsersTableState {
	const trail = state.trail.slice(0, -1);
	const previous = state.trail.at(-1);
	return compact({ ...state, cursor: previous ? previous : undefined, trail });
}

type FilterPatch = Partial<
	Pick<UsersTableState, "channel" | "kind" | "status" | "q">
>;

/** Applies filter changes (empty string clears a filter) and restarts paging. */
export function withFilters(
	state: UsersTableState,
	patch: { [K in keyof FilterPatch]?: FilterPatch[K] | "" },
): UsersTableState {
	const next: UsersTableState = { ...state, cursor: undefined, trail: [] };
	for (const [key, value] of Object.entries(patch)) {
		(next as unknown as Record<string, unknown>)[key] =
			value === "" ? undefined : value;
	}
	return compact(next);
}

export function sortingFromState(state: UsersTableState): SortingEntry[] {
	return [{ id: state.sort, desc: state.order === "desc" }];
}

export function withSorting(
	state: UsersTableState,
	sorting: SortingEntry[],
): UsersTableState {
	const first = sorting[0];
	const sort = first ? oneOf(SORTS, first.id) : undefined;
	return compact({
		...state,
		sort: sort ?? DEFAULT_SORT,
		order: sort && first ? (first.desc ? "desc" : "asc") : DEFAULT_ORDER,
		cursor: undefined,
		trail: [],
	});
}
