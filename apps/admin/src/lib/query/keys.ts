import type { LiveTopic, LiveTopics } from "admin-api/types";

/**
 * The cache key of a live topic's data. It is the same key the page's query
 * uses, so a snapshot pushed over the WebSocket lands in exactly the entry the
 * page reads. Params are hashed by content (key order and `undefined` don't matter).
 */
export function topicKey<T extends LiveTopic>(
	topic: T,
	params: LiveTopics[T]["params"],
) {
	return [topic, params] as const;
}

/** The host snapshot: fetched once for the first paint, then replaced by the `/api/system/stream` pushes. */
export const SYSTEM_KEY = ["system"] as const;
