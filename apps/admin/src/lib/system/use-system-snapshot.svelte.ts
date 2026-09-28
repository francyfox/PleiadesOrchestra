import { createQuery } from "@tanstack/svelte-query";
import { IsDocumentVisible } from "runed";
import { reportConnection } from "$lib/live/connection";
import { queryClient } from "$lib/query/client";
import { prefetched } from "$lib/query/prefetch";
import { queries } from "$lib/query/queries";
import type { SystemSnapshot } from "$lib/system-types";
import { createSystemStream, streamUrl } from "./system-stream";

/**
 * Live host snapshot: the `system` query (the layout's `load` prefetched it)
 * that the WebSocket keeps replacing. The socket exists only while the tab is
 * visible — a hidden tab makes no requests at all. Call during component init.
 */
export function useSystemSnapshot() {
	const visible = new IsDocumentVisible();
	const query = createQuery(() => queries.system());

	$effect(() => {
		if (!visible.current) return;
		const stream = createSystemStream<SystemSnapshot>({
			url: streamUrl(window.location.origin),
			connect: (url) => new WebSocket(url),
			onStatus: (up) => reportConnection("socket", "system", !up),
			onSnapshot: (snapshot) => {
				queryClient.setQueryData(queries.system().queryKey, snapshot);
			},
		});
		stream.start();
		return () => stream.stop();
	});

	return {
		get current(): SystemSnapshot {
			return prefetched(query);
		},
	};
}
