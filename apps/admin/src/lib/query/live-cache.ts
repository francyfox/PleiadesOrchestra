import type { QueryClient } from "@tanstack/query-core";
import type { LiveErrorCode, LiveTopic, LiveTopics } from "admin-api/types";
import type { Problem } from "$lib/live/connection-monitor";
import { topicKey } from "./keys";

/** The slice of the live client `bindLiveTopic` needs. */
export interface LiveSource {
	subscribe<T extends LiveTopic>(
		topic: T,
		params: LiveTopics[T]["params"],
		handlers: {
			onData(data: LiveTopics[T]["data"]): void;
			onError?(code: LiveErrorCode): void;
		},
	): () => void;
}

export interface LiveCacheDeps {
	client: QueryClient;
	live: LiveSource;
	report: (problem: Problem, source: string, down: boolean) => void;
}

/**
 * Feeds one topic's pushes into the query cache: every snapshot is
 * written under the topic's key (an equal one keeps the cached object, so
 * nothing re-renders), and the connection monitor hears whether the data
 * source behind the server is answering. Returns the unsubscribe.
 */
export function bindLiveTopic<T extends LiveTopic>(
	{ client, live, report }: LiveCacheDeps,
	topic: T,
	params: LiveTopics[T]["params"],
	source = topic as string,
): () => void {
	const unsubscribe = live.subscribe(topic, params, {
		onData(data) {
			report("upstream", source, false);
			client.setQueryData(topicKey(topic, params), data);
		},
		onError(code) {
			if (code === "upstream") report("upstream", source, true);
		},
	});
	return () => {
		unsubscribe();
		report("upstream", source, false);
	};
}
