import { reportConnection } from "./connection";
import { createLiveClient, type LiveClient, liveUrl } from "./live-client";

let client: LiveClient | undefined;

/** The tab's single live connection: created on first use, wired to the real WebSocket and tab visibility. */
export function getLiveClient(): LiveClient {
	client ??= createLiveClient({
		url: liveUrl(window.location.origin),
		connect: (url) => new WebSocket(url),
		isVisible: () => document.visibilityState === "visible",
		onStatus: (up) => reportConnection("socket", "live", !up),
		onVisibilityChange: (callback) => {
			document.addEventListener("visibilitychange", callback);
			return () => document.removeEventListener("visibilitychange", callback);
		},
	});
	return client;
}
