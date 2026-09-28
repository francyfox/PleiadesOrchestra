import { IsDocumentVisible } from "runed";
import type { SystemSnapshot } from "$lib/system-types";
import { createSystemStream, streamUrl } from "./system-stream";

/**
 * Live host snapshot: `initial` (loaded with the page) until the WebSocket
 * delivers, then whatever it last sent. The socket exists only while the tab
 * is visible — a hidden tab makes no requests at all. Call during component init.
 */
export function useSystemSnapshot(initial: () => SystemSnapshot) {
	const visible = new IsDocumentVisible();
	let live = $state<SystemSnapshot | null>(null);

	$effect(() => {
		if (!visible.current) return;
		const stream = createSystemStream<SystemSnapshot>({
			url: streamUrl(window.location.origin),
			connect: (url) => new WebSocket(url),
			onSnapshot: (snapshot) => {
				live = snapshot;
			},
		});
		stream.start();
		return () => stream.stop();
	});

	return {
		get current(): SystemSnapshot {
			return live ?? initial();
		},
	};
}
