import type { McpCallToolResult } from "@repo/core";
import { costUsd } from "./efficiency.service.ts";
import type { MockShop } from "./efficiency.shop.ts";
import type { Contender, PriceOf } from "./efficiency.types.ts";

type Line =
	| { type: "delta"; text: string }
	| { type: "done"; totalInputTokens?: number; totalOutputTokens?: number }
	| {
			type: "tool_call";
			tool: string;
			arguments: Record<string, unknown>;
			callId: string;
	  }
	| { type: "error"; message: string; hint?: string }
	| { type: "step" | "progress" | "cancelled" };

interface LlmCall {
	model: string;
	inputTokens: number | null;
	outputTokens: number | null;
}

/** Browser round trips one message may take before the case is given up. */
const MAX_ROUND_TRIPS = 30;
/** The widget's limits are per minute (`/tools` counts as a message: 10 a minute by default). */
const RATE_LIMIT_WAIT_MS = 61_000;
const RATE_LIMIT_RETRIES = 3;

/**
 * The orchestrator with beta, driven exactly as the widget drives it: a
 * visitor, a thread per case, the shop's tools announced, then every
 * `tool_call` line run on the mock shop and posted back to `/tool-results`.
 * The channel (publishable key, allowed origin) must exist on the server.
 *
 * Tokens: the stream's `done` line counts only the reply model. With
 * `adminApiKey` the request's `llmCalls` (Laya, delta, translator, beta) are
 * read from `/v1/admin/requests` instead.
 */
export function createOrchestraContender(deps: {
	baseUrl: string;
	publishableKey: string;
	origin: string;
	adminApiKey?: string;
	priceOf: PriceOf;
	fetch?: typeof fetch;
	rateLimitWaitMs?: number;
}): Contender {
	const http = deps.fetch ?? fetch;
	const rateLimitWaitMs = deps.rateLimitWaitMs ?? RATE_LIMIT_WAIT_MS;
	let visitorToken: Promise<string> | undefined;
	// Time spent waiting out a 429: the widget's rate limit, not the orchestrator's speed.
	let pausedMs = 0;

	async function post(
		path: string,
		body: unknown,
		headers: Record<string, string>,
	) {
		for (let attempt = 0; ; attempt++) {
			const response = await http(`${deps.baseUrl}${path}`, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					origin: deps.origin,
					...headers,
				},
				body: JSON.stringify(body),
			});
			if (response.status === 429 && attempt < RATE_LIMIT_RETRIES) {
				process.stderr.write(
					`\n⏸ ${path}: 429, waiting ${rateLimitWaitMs / 1000}s (not timed)\n`,
				);
				await Bun.sleep(rateLimitWaitMs);
				pausedMs += rateLimitWaitMs;
				continue;
			}
			if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
			return response;
		}
	}

	const visitor = (token: string) => ({ "x-visitor-token": token });

	async function thread(token: string, shop: MockShop): Promise<string> {
		const { threadId } = (await (
			await post("/v1/widget/threads", {}, visitor(token))
		).json()) as { threadId: string };
		const { tools } = await shop.listTools();
		await post(
			"/v1/widget/tools",
			{ threadId, webmcpTools: tools },
			visitor(token),
		);
		return threadId;
	}

	/** One visitor for the whole run; a first message waits out the catalog's one-time classification so case 1 isn't charged for it. */
	function start(shop: MockShop): Promise<string> {
		visitorToken ??= (async () => {
			const response = await post(
				"/v1/widget/visitors",
				{},
				{ "x-publishable-key": deps.publishableKey },
			);
			const { visitorToken: token } = (await response.json()) as {
				visitorToken: string;
			};
			const warmup = await thread(token, shop);
			await (
				await post(
					"/v1/widget/messages",
					{ threadId: warmup, text: "hi", lang: "en" },
					visitor(token),
				)
			).text();
			return token;
		})();
		return visitorToken;
	}

	async function lines(response: Response): Promise<Line[]> {
		return (await response.text())
			.split("\n")
			.filter((line) => line.trim())
			.map((line) => JSON.parse(line) as Line);
	}

	async function admin<T>(path: string): Promise<T> {
		const response = await http(`${deps.baseUrl}${path}`, {
			headers: { authorization: `Bearer ${deps.adminApiKey}` },
		});
		if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
		return (await response.json()) as T;
	}

	/** Every model call of the thread's request; the usage ledger is flushed in the background, so a few tries. */
	async function llmCalls(threadId: string): Promise<LlmCall[]> {
		for (let attempt = 0; attempt < 5; attempt++) {
			const { items } = await admin<{
				items: { id: string; threadId: string }[];
			}>("/v1/admin/requests?pageSize=20");
			const request = items.find((item) => item.threadId === threadId);
			if (request) {
				const details = await admin<{ llmCalls: LlmCall[] }>(
					`/v1/admin/requests/${request.id}`,
				);
				if (details.llmCalls.length) return details.llmCalls;
			}
			await Bun.sleep(500);
		}
		return [];
	}

	return {
		name: "orchestra + beta",
		tokensNote: deps.adminApiKey
			? "every model call of the request (Laya, delta, translator, beta) from /v1/admin/requests"
			: "reply model only (set ORCHESTRA_ADMIN_API_KEY to count Laya, delta and the translator too)",
		async run(shop, test) {
			const base = {
				id: test.id,
				modelCalls: 0,
				toolCalls: 0,
				inputTokens: 0,
				outputTokens: 0,
				costUsd: 0,
			};
			let started = performance.now();
			let pausedAtStart = pausedMs;
			let reply = "";
			try {
				const token = await start(shop);
				const threadId = await thread(token, shop);
				started = performance.now();
				pausedAtStart = pausedMs;
				let response = await post(
					"/v1/widget/messages",
					{ threadId, text: test.text, lang: "en" },
					visitor(token),
				);
				let done: Extract<Line, { type: "done" }> | undefined;
				for (let trip = 0; trip < MAX_ROUND_TRIPS; trip++) {
					const stream = await lines(response);
					for (const line of stream)
						if (line.type === "delta") reply += line.text;
					const last = stream.at(-1);
					if (last?.type === "error")
						throw new Error(
							`${last.message}${last.hint ? ` (${last.hint})` : ""}`,
						);
					if (last?.type !== "tool_call") {
						done = last?.type === "done" ? last : undefined;
						break;
					}
					base.toolCalls++;
					const result: McpCallToolResult = await shop.callTool({
						name: last.tool,
						arguments: last.arguments,
					});
					response = await post(
						"/v1/widget/tool-results",
						{
							threadId,
							callId: last.callId,
							tool: last.tool,
							result,
							isError: result.isError ?? false,
							lang: "en",
						},
						visitor(token),
					);
				}
				const latencyMs =
					performance.now() - started - (pausedMs - pausedAtStart);

				if (deps.adminApiKey) {
					const calls = await llmCalls(threadId);
					base.modelCalls = calls.length;
					base.inputTokens = calls.reduce(
						(sum, call) => sum + (call.inputTokens ?? 0),
						0,
					);
					base.outputTokens = calls.reduce(
						(sum, call) => sum + (call.outputTokens ?? 0),
						0,
					);
					base.costUsd = calls.reduce(
						(sum, call) =>
							sum +
							costUsd(
								call.inputTokens ?? 0,
								call.outputTokens ?? 0,
								deps.priceOf(call.model),
							),
						0,
					);
				} else {
					base.inputTokens = done?.totalInputTokens ?? 0;
					base.outputTokens = done?.totalOutputTokens ?? 0;
					base.modelCalls = base.inputTokens || base.outputTokens ? 1 : 0;
					// The stream doesn't name the model: the fallback price.
					base.costUsd = costUsd(
						base.inputTokens,
						base.outputTokens,
						deps.priceOf(undefined),
					);
				}
				return { ...base, latencyMs, reply };
			} catch (error) {
				return {
					...base,
					latencyMs: performance.now() - started - (pausedMs - pausedAtStart),
					reply,
					error: error instanceof Error ? error.message : String(error),
				};
			}
		},
	};
}
