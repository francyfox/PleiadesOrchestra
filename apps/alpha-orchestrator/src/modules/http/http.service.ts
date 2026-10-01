export const MINUTE_MS = 60 * 1000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

/** The admin who made the request (`X-Admin-Id`, checked by the auth guard on mutations). */
export function adminIdOf(request: Request): string {
	return request.headers.get("x-admin-id") ?? "";
}

/** Offset paging; without `pageSize` everything is returned (`page` is then ignored). */
export interface PageParams {
	page?: number;
	pageSize?: number;
}

/** SQL `LIMIT`/`OFFSET` for the page, or `{}` when the whole list is wanted. */
export function limitOffset({ page = 1, pageSize }: PageParams) {
	return pageSize === undefined
		? {}
		: { limit: pageSize, offset: (Math.max(1, page) - 1) * pageSize };
}
