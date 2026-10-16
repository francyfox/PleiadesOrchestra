import { afterEach, describe, expect, test } from "bun:test";
import { api } from "#lib/api/client.js";
import { unwrap } from "#lib/api/result.js";
import { queryClient } from "./client";
import { prefetch } from "./prefetch";

// The Eden client resolves `/api` against the page origin.
(globalThis as { window?: unknown }).window = {
	location: { origin: "http://localhost" },
};

afterEach(() => queryClient.clear());

function recordingFetch() {
	const urls: string[] = [];
	const fetcher = (async (input: RequestInfo | URL) => {
		urls.push(input instanceof Request ? input.url : String(input));
		return Response.json({ admin: null, setupRequired: false });
	}) as typeof fetch;
	return { urls, fetcher };
}

describe("prefetch", () => {
	test("the query's request goes through the fetch `load` was given, not window.fetch", async () => {
		const { urls, fetcher } = recordingFetch();

		await prefetch(fetcher, {
			queryKey: ["session"],
			queryFn: () => unwrap(api().session.get()),
		});

		expect(urls).toEqual(["http://localhost/api/session"]);
	});

	test("after the prefetch the shared client is back on window.fetch", async () => {
		const loadFetch = recordingFetch();
		const windowFetch = recordingFetch();
		const original = globalThis.fetch;
		globalThis.fetch = windowFetch.fetcher;
		try {
			await prefetch(loadFetch.fetcher, {
				queryKey: ["session"],
				queryFn: () => unwrap(api().session.get()),
			});
			await unwrap(api().session.get());
		} finally {
			globalThis.fetch = original;
		}

		expect(loadFetch.urls).toHaveLength(1);
		expect(windowFetch.urls).toEqual(["http://localhost/api/session"]);
	});
});
