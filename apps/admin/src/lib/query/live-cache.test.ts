import { describe, expect, test } from "bun:test";
import { QueryClient } from "@tanstack/query-core";
import { topicKey } from "./keys";
import { bindLiveTopic, type LiveSource } from "./live-cache";

function fakeLive() {
	const subscriptions: {
		topic: string;
		params: object;
		handlers: {
			onData(data: unknown): void;
			onError?(code: string): void;
		};
		closed: boolean;
	}[] = [];
	const source: LiveSource = {
		subscribe: (topic, params, handlers) => {
			const entry = {
				topic,
				params,
				handlers,
				closed: false,
			} as never as (typeof subscriptions)[number];
			subscriptions.push(entry);
			return () => {
				entry.closed = true;
			};
		},
	};
	return { source, subscriptions };
}

describe("bindLiveTopic", () => {
	test("a pushed snapshot lands in the cache under the topic's key", () => {
		const client = new QueryClient();
		const { source, subscriptions } = fakeLive();
		bindLiveTopic({ client, live: source, report: () => {} }, "users", {
			limit: 10,
		});

		subscriptions[0]?.handlers.onData({ items: [1], total: 1 });

		expect(
			client.getQueryData<unknown>(topicKey("users", { limit: 10 })),
		).toEqual({
			items: [1],
			total: 1,
		});
	});

	test("an equal snapshot keeps the cached object, so nothing re-renders", () => {
		const client = new QueryClient();
		const { source, subscriptions } = fakeLive();
		bindLiveTopic({ client, live: source, report: () => {} }, "agents", {});

		subscriptions[0]?.handlers.onData({ items: [{ name: "beta" }] });
		const first = client.getQueryData<unknown>(topicKey("agents", {}));
		subscriptions[0]?.handlers.onData({ items: [{ name: "beta" }] });

		expect(client.getQueryData<unknown>(topicKey("agents", {}))).toBe(first);
	});

	test("tells the connection monitor when the data source stops and resumes answering", () => {
		const client = new QueryClient();
		const { source, subscriptions } = fakeLive();
		const reports: [string, string, boolean][] = [];
		bindLiveTopic(
			{ client, live: source, report: (p, s, d) => reports.push([p, s, d]) },
			"agents",
			{},
			"agents:1",
		);

		subscriptions[0]?.handlers.onError?.("upstream");
		subscriptions[0]?.handlers.onData({ items: [] });

		expect(reports).toEqual([
			["upstream", "agents:1", true],
			["upstream", "agents:1", false],
		]);
	});

	test("the returned function unsubscribes and clears this subscription's problem", () => {
		const client = new QueryClient();
		const { source, subscriptions } = fakeLive();
		const reports: [string, string, boolean][] = [];
		const stop = bindLiveTopic(
			{ client, live: source, report: (p, s, d) => reports.push([p, s, d]) },
			"agents",
			{},
			"agents:1",
		);

		stop();

		expect(subscriptions[0]?.closed).toBe(true);
		expect(reports).toEqual([["upstream", "agents:1", false]]);
	});
});
