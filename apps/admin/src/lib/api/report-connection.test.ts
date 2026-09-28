import { describe, expect, test } from "bun:test";
import type { Problem } from "$lib/live/connection-monitor";
import { withConnectionReport } from "./report-connection";

type Report = [Problem, string, boolean];

function setup(behaviour: () => Promise<Response>) {
	const reports: Report[] = [];
	const fetcher = withConnectionReport(
		(async () => behaviour()) as unknown as typeof fetch,
		(problem, source, down) => reports.push([problem, source, down]),
	);
	return { reports, fetcher };
}

describe("withConnectionReport", () => {
	test("a request that cannot reach the server reports the connection as lost", async () => {
		const { reports, fetcher } = setup(async () => {
			throw new TypeError("Failed to fetch");
		});
		await expect(fetcher("/api/x")).rejects.toThrow("Failed to fetch");
		expect(reports).toEqual([["socket", "http", true]]);
	});

	test.each([502, 503, 504])(
		"a %d means the server is reachable but its data source is not answering",
		async (status) => {
			const { reports, fetcher } = setup(
				async () => new Response("", { status }),
			);
			const response = await fetcher("/api/x");
			expect(response.status).toBe(status);
			expect(reports).toEqual([
				["socket", "http", false],
				["upstream", "http", true],
			]);
		},
	);

	test("any other answer clears both problems", async () => {
		const { reports, fetcher } = setup(
			async () => new Response("", { status: 401 }),
		);
		await fetcher("/api/x");
		expect(reports).toEqual([
			["socket", "http", false],
			["upstream", "http", false],
		]);
	});

	test("a request cancelled on purpose is not a problem", async () => {
		const { reports, fetcher } = setup(async () => {
			throw new DOMException("aborted", "AbortError");
		});
		await expect(fetcher("/api/x")).rejects.toThrow();
		expect(reports).toEqual([]);
	});
});
