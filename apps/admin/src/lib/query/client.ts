import { QueryClient } from "@tanstack/query-core";
import { shouldRetry } from "./retry";

/**
 * Non-live queries are fresh for half a minute, so a page's own mount doesn't
 * repeat the request its `load` just made. Live queries and the host snapshot
 * override this with `Infinity` — the WebSocket keeps them current. There is no
 * refetch on window focus: the socket already covers "the tab is back".
 */
export function createQueryClient() {
	return new QueryClient({
		defaultOptions: {
			queries: {
				retry: shouldRetry,
				staleTime: 30_000,
				refetchOnWindowFocus: false,
			},
		},
	});
}

/** The panel is a client-only SPA (`ssr = false`), so one client per tab: `load` functions, components and the live feeds all share it. */
export const queryClient = createQueryClient();
