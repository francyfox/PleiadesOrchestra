/** Rows per page in every admin table. */
export const DEFAULT_PAGE_SIZE = 10;

export function pageCount(total: number, pageSize: number): number {
	return Math.max(1, Math.ceil(total / pageSize));
}

export function clampPage(page: number, pages: number): number {
	return Math.min(Math.max(page, 1), pages);
}

/** The rows of a 1-based `page`; an out-of-range page snaps to the nearest real one. */
export function pageSlice<T>(
	rows: readonly T[],
	page: number,
	pageSize: number,
): T[] {
	const current = clampPage(page, pageCount(rows.length, pageSize));
	return rows.slice((current - 1) * pageSize, current * pageSize);
}

/** `?page=` from the URL: a positive integer, anything else is page one. */
export function parsePage(value: string | null): number {
	const parsed = Number.parseInt(value ?? "", 10);
	return Number.isNaN(parsed) || parsed < 1 ? 1 : parsed;
}

/** A page the server already cut: `href(n)` is the URL of page `n`. */
export interface ServerPagination {
	page: number;
	pageSize: number;
	total: number;
	href: (page: number) => string;
}
