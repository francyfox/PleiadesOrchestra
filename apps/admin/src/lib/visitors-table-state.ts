import type {
	SortOrder,
	VisitorKind,
	VisitorStatus,
	VisitorsQuery,
	VisitorsSort,
} from "./api-types";
import { DEFAULT_PAGE_SIZE } from "./pagination";

/**
 * `/visitors` table state, owned by the URL (server-side filtering, sorting and
 * cursor paging). The orchestrator only pages forward, so `trail` keeps the
 * cursors of earlier pages to make "back" possible; `""` stands for page one.
 */
export interface VisitorsTableState {
	channel?: string;
	kind?: VisitorKind;
	status?: VisitorStatus;
	q?: string;
	sort: VisitorsSort;
	order: SortOrder;
	limit: number;
	cursor?: string;
	trail: string[];
}

export interface SortingEntry {
	id: string;
	desc: boolean;
}

const DEFAULT_SORT: VisitorsSort = "lastSeenAt";
const DEFAULT_ORDER: SortOrder = "desc";
const DEFAULT_LIMIT = DEFAULT_PAGE_SIZE;
const MAX_LIMIT = 200;

const KINDS: readonly VisitorKind[] = ["identified", "anonymous"];
const STATUSES: readonly VisitorStatus[] = ["allowed", "pending", "blocked"];
const SORTS: readonly VisitorsSort[] = ["lastSeenAt", "createdAt", "tokens"];
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
function compact(state: VisitorsTableState): VisitorsTableState {
	return Object.fromEntries(
		Object.entries(state).filter(([, value]) => value !== undefined),
	) as unknown as VisitorsTableState;
}

export function parseVisitorsState(
	params: URLSearchParams,
): VisitorsTableState {
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

export function visitorsStateToSearch(
	state: VisitorsTableState,
): URLSearchParams {
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

export function toVisitorsQuery(state: VisitorsTableState): VisitorsQuery {
	const { trail: _trail, ...query } = state;
	return query;
}

export function nextPage(
	state: VisitorsTableState,
	nextCursor: string,
): VisitorsTableState {
	return {
		...state,
		cursor: nextCursor,
		trail: [...state.trail, state.cursor ?? ""],
	};
}

export function prevPage(state: VisitorsTableState): VisitorsTableState {
	const trail = state.trail.slice(0, -1);
	const previous = state.trail.at(-1);
	return compact({ ...state, cursor: previous ? previous : undefined, trail });
}

type FilterPatch = Partial<
	Pick<VisitorsTableState, "channel" | "kind" | "status" | "q">
>;

/** Applies filter changes (empty string clears a filter) and restarts paging. */
export function withFilters(
	state: VisitorsTableState,
	patch: { [K in keyof FilterPatch]?: FilterPatch[K] | "" },
): VisitorsTableState {
	const next: VisitorsTableState = { ...state, cursor: undefined, trail: [] };
	for (const [key, value] of Object.entries(patch)) {
		(next as unknown as Record<string, unknown>)[key] =
			value === "" ? undefined : value;
	}
	return compact(next);
}

export function sortingFromState(state: VisitorsTableState): SortingEntry[] {
	return [{ id: state.sort, desc: state.order === "desc" }];
}

export function withSorting(
	state: VisitorsTableState,
	sorting: SortingEntry[],
): VisitorsTableState {
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
