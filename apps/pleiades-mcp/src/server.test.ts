import { describe, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { Harness } from "./harness";
import { createPleiadesServer } from "./server";

const sites = [{ slug: "shop-a", host: "shop.example.com" }];

function fakeHarness(
	reply: Awaited<ReturnType<Harness["ask"]>>,
	decide: Harness["decide"] = async () => ({}),
) {
	const calls: Parameters<Harness["ask"]>[0][] = [];
	const harness: Harness = {
		async ask(input) {
			calls.push(input);
			return reply;
		},
		decide,
	};
	return { harness, calls };
}

async function connect(harness: Harness) {
	const server = createPleiadesServer({ sites, harness, userId: "mcp" });
	const client = new Client({ name: "test", version: "0" });
	const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
	await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
	return client;
}

async function callJson(
	client: Client,
	name: string,
	args: Record<string, unknown>,
) {
	const result = await client.callTool({ name, arguments: args });
	const [block] = result.content as { type: string; text: string }[];
	return {
		isError: result.isError ?? false,
		body: JSON.parse(block?.text ?? "null"),
	};
}

describe("pleiades MCP server", () => {
	test("exposes the tools, and their descriptions say when to fall back to the browser", async () => {
		const client = await connect(
			fakeHarness({ ok: true, answer: "", usage: {} }).harness,
		);
		const { tools } = await client.listTools();
		expect(tools.map((tool) => tool.name).sort()).toEqual([
			"pleiades_decide",
			"pleiades_list_sites",
			"pleiades_site_task",
		]);
		const task = tools.find((tool) => tool.name === "pleiades_site_task");
		expect(task?.description).toContain("not_applicable");
		expect(task?.description).toContain("browser");
	});

	test("pleiades_list_sites returns the configured sites", async () => {
		const client = await connect(
			fakeHarness({ ok: true, answer: "", usage: {} }).harness,
		);
		const { body } = await callJson(client, "pleiades_list_sites", {});
		expect(body).toEqual({
			sites: [{ slug: "shop-a", host: "shop.example.com" }],
		});
	});

	test("a site that isn't connected is not_applicable and the harness is never called", async () => {
		const { harness, calls } = fakeHarness({
			ok: true,
			answer: "x",
			usage: {},
		});
		const client = await connect(harness);
		const { body, isError } = await callJson(client, "pleiades_site_task", {
			site: "elsewhere.org",
			task: "find shoes",
		});
		expect(body.status).toBe("not_applicable");
		expect(isError).toBe(false);
		expect(calls).toHaveLength(0);
	});

	test("a connected site is asked on its own channel and thread", async () => {
		const { harness, calls } = fakeHarness({
			ok: true,
			answer: "Red jacket, $79",
			usage: { elapsedMs: 373, inputTokens: 235, outputTokens: 11 },
		});
		const client = await connect(harness);
		const { body, isError } = await callJson(client, "pleiades_site_task", {
			site: "https://www.shop.example.com/",
			task: "find a red jacket",
		});
		expect(body).toEqual({
			status: "done",
			answer: "Red jacket, $79",
			data: { usage: { elapsedMs: 373, inputTokens: 235, outputTokens: 11 } },
		});
		expect(isError).toBe(false);
		expect(calls).toEqual([
			{
				channel: "shop-a",
				threadId: "mcp-shop-a",
				userId: "mcp",
				text: "find a red jacket",
			},
		]);
	});

	test("a harness failure is status failed and flagged as a tool error", async () => {
		const client = await connect(
			fakeHarness({ ok: false, message: "harness: 502" }).harness,
		);
		const { body, isError } = await callJson(client, "pleiades_site_task", {
			site: "shop-a",
			task: "anything",
		});
		expect(body).toEqual({ status: "failed", answer: "harness: 502" });
		expect(isError).toBe(true);
	});

	test("pleiades_decide asks the decision model and returns the winner with its probability", async () => {
		const asked: unknown[] = [];
		const client = await connect(
			fakeHarness(
				{ ok: true, answer: "", usage: {} },
				async (state, questions) => {
					asked.push({ state, questions });
					return {
						choice: {
							type: "choice",
							choice: "red",
							probabilities: { red: 0.8, blue: 0.2 },
						},
					};
				},
			).harness,
		);
		const { body, isError } = await callJson(client, "pleiades_decide", {
			question: "Which jacket fits 'warm and red'?",
			options: { red: "Red parka", blue: "Blue windbreaker" },
		});
		expect(body).toEqual({ status: "done", choice: "red", probability: 0.8 });
		expect(isError).toBe(false);
		expect(asked).toEqual([
			{
				state: {},
				questions: {
					choice: {
						type: "choice",
						instructions: "Which jacket fits 'warm and red'?",
						criteria: { red: "Red parka", blue: "Blue windbreaker" },
					},
				},
			},
		]);
	});

	test("pleiades_decide that gets no usable answer or fails is status failed", async () => {
		const empty = await connect(
			fakeHarness({ ok: true, answer: "", usage: {} }).harness,
		);
		expect(
			(
				await callJson(empty, "pleiades_decide", {
					question: "q",
					options: { a: "A", b: "B" },
				})
			).body.status,
		).toBe("failed");

		const broken = await connect(
			fakeHarness({ ok: true, answer: "", usage: {} }, async () => {
				throw new Error("harness: HTTP 502");
			}).harness,
		);
		const { body, isError } = await callJson(broken, "pleiades_decide", {
			question: "q",
			options: { a: "A", b: "B" },
		});
		expect(body).toEqual({ status: "failed", answer: "harness: HTTP 502" });
		expect(isError).toBe(true);
	});
});
