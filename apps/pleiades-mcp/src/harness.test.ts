import { describe, expect, test } from "bun:test";
import { createHarness, type FetchLike } from "./harness";

const enc = new TextEncoder();

function ndjson(lines: unknown[], chunkSize = 1000): Response {
	const bytes = enc.encode(
		`${lines.map((line) => JSON.stringify(line)).join("\n")}\n`,
	);
	return new Response(
		new ReadableStream({
			start(controller) {
				for (let i = 0; i < bytes.length; i += chunkSize) {
					controller.enqueue(bytes.slice(i, i + chunkSize));
				}
				controller.close();
			},
		}),
		{ headers: { "content-type": "application/x-ndjson" } },
	);
}

const input = {
	channel: "shop-a",
	threadId: "mcp-shop-a",
	userId: "mcp",
	text: "hi",
};

function harnessWith(fetchImpl: FetchLike) {
	return createHarness({
		baseURL: "http://orch:3000",
		apiKey: "secret",
		fetch: fetchImpl,
	});
}

describe("createHarness().ask", () => {
	test("joins the streamed deltas into the answer and reports usage from `done`", async () => {
		const harness = harnessWith(async () =>
			ndjson([
				{ type: "delta", text: "Hel" },
				{ type: "delta", text: "lo" },
				{ type: "done", elapsedMs: 373, inputTokens: 235, outputTokens: 11 },
			]),
		);
		expect(await harness.ask(input)).toEqual({
			ok: true,
			answer: "Hello",
			usage: { elapsedMs: 373, inputTokens: 235, outputTokens: 11 },
		});
	});

	test("survives a line split across network chunks", async () => {
		const harness = harnessWith(async () =>
			ndjson(
				[
					{ type: "delta", text: "Привет" },
					{ type: "done", elapsedMs: 1 },
				],
				7,
			),
		);
		const result = await harness.ask(input);
		expect(result).toMatchObject({ ok: true, answer: "Привет" });
	});

	test("posts the bearer key and the message to /v1/messages", async () => {
		let seen: { url: string; init: RequestInit } | undefined;
		const harness = harnessWith(async (url, init) => {
			seen = { url, init };
			return ndjson([{ type: "done", elapsedMs: 1 }]);
		});
		await harness.ask(input);
		if (!seen) throw new Error("harness never called fetch");
		expect(seen.url).toBe("http://orch:3000/v1/messages");
		expect((seen.init.headers as Record<string, string>).authorization).toBe(
			"Bearer secret",
		);
		expect(JSON.parse(String(seen.init.body))).toEqual(input);
	});

	test("an `error` line is a failure carrying the harness message", async () => {
		const harness = harnessWith(async () =>
			ndjson([
				{ type: "delta", text: "par" },
				{ type: "error", message: "no plan reached the goal" },
			]),
		);
		expect(await harness.ask(input)).toEqual({
			ok: false,
			message: "no plan reached the goal",
		});
	});

	test("403 (denied user) is reported as an access problem", async () => {
		const harness = harnessWith(
			async () => new Response(null, { status: 403 }),
		);
		const result = await harness.ask(input);
		expect(result).toMatchObject({ ok: false });
		expect(result.ok === false && result.message).toContain("access");
	});

	test("other HTTP errors carry the status", async () => {
		const harness = harnessWith(
			async () => new Response("boom", { status: 502 }),
		);
		const result = await harness.ask(input);
		expect(result.ok === false && result.message).toContain("502");
	});

	test("a network failure never throws", async () => {
		const harness = harnessWith(async () => {
			throw new Error("ECONNREFUSED");
		});
		const result = await harness.ask(input);
		expect(result.ok === false && result.message).toContain("ECONNREFUSED");
	});
});
