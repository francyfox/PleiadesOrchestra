import { hashKey } from "@tanstack/query-core";
import { createQuery } from "@tanstack/svelte-query";
import type { LiveTopic, LiveTopics } from "admin-api/types";
import { untrack } from "svelte";
import { queryClient } from "$lib/query/client";
import { topicKey } from "$lib/query/keys";
import { bindLiveTopic } from "$lib/query/live-cache";
import { prefetched } from "$lib/query/prefetch";
import { liveQueries } from "$lib/query/queries";
import { getLiveClient } from "./browser-client";
import { reportConnection } from "./connection";

let instances = 0;

/**
 * The page's data for a live topic: an ordinary query (its `load` prefetched
 * it) that the `/api/live` socket keeps current by writing every push into the
 * same cache entry. Subscribed only while the page is mounted with these params
 * (and the tab is visible — see live-client); the server sends again only when
 * the data changed. `current` is what the page's `load` prefetched, then the
 * newest push. Call during component init.
 */
export function useLiveQuery<T extends LiveTopic>(
	topic: T,
	params: () => LiveTopics[T]["params"],
): { readonly current: LiveTopics[T]["data"] } {
	// Names this page's subscription to the connection monitor (the data source behind the server).
	const source = `${topic}:${++instances}`;

	const query = createQuery(() =>
		(liveQueries[topic] as (p: object) => never)(params()),
	) as unknown as { data: LiveTopics[T]["data"] | undefined };

	// Keyed by content, so an equal-but-new params object doesn't resubscribe.
	const key = $derived(hashKey(topicKey(topic, params())));

	$effect(() => {
		void key;
		return bindLiveTopic(
			{ client: queryClient, live: getLiveClient(), report: reportConnection },
			topic,
			untrack(params),
			source,
		);
	});

	return {
		get current() {
			return prefetched(query);
		},
	};
}
