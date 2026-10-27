import type { McpCallToolResult } from "@repo/core";
import {
	asInfra,
	createInfraFetch,
	InfraError,
	type InfraOptions,
} from "./efficiency.infra.ts";
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

/** `/v1/admin/requests/:id`: kept whole for the traces, `llmCalls` is what the metrics read. */
interface Details {
	llmCalls: LlmCall[];
	[key: string]: unknown;
}

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
 * `adminApiKey` the request's `llmCalls` (Laya, delta, alpha-understand, beta) are
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
	/** Timeout and retry delays (tests). */
	infra?: InfraOptions;
}): Contender {
	// The widget's own 429 is waited out below, the rest is retried here.
	const http = createInfraFetch({
		...deps.infra,
		fetch: deps.fetch,
		retry429: false,
	});
	const rateLimitWaitMs = deps.rateLimitWaitMs ?? RATE_LIMIT_WAIT_MS;
	let visitorToken: Promise<string> | undefined;

	async function post(
		path: string,
		body: unknown,
		headers: Record<string, string>,
		// Time this case spent waiting out a 429: the widget's rate limit, not the orchestrator's speed.
		paused?: { ms: number },
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
				if (paused) paused.ms += rateLimitWaitMs;
				continue;
			}
			if (!response.ok)
				throw new InfraError("http", `${path}: HTTP ${response.status}`);
			return response;
		}
	}

	const visitor = (token: string) => ({ "x-visitor-token": token });

	async function thread(
		token: string,
		shop: MockShop,
		paused?: { ms: number },
	): Promise<string> {
		const { threadId } = (await (
			await post("/v1/widget/threads", {}, visitor(token), paused)
		).json()) as { threadId: string };
		const { tools } = await shop.listTools();
		await post(
			"/v1/widget/tools",
			{ threadId, webmcpTools: tools },
			visitor(token),
			paused,
		);
		return threadId;
	}

	/** One visitor for the whole run; a first message waits out the catalog's one-time classification so case 1 isn't charged for it. */
	function start(shop: MockShop): Promise<string> {
		// A failed start is not remembered: the next case tries again.
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
		const pending = visitorToken;
		pending.catch(() => {
			if (visitorToken === pending) visitorToken = undefined;
		});
		return pending;
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
		if (!response.ok)
			throw new InfraError("http", `${path}: HTTP ${response.status}`);
		return (await response.json()) as T;
	}

	/** The thread's request with every model call; the usage ledger is flushed in the background, so a few tries. */
	async function requestDetails(threadId: string): Promise<Details> {
		for (let attempt = 0; attempt < 5; attempt++) {
			const { items } = await admin<{
				items: { id: string; threadId: string }[];
			}>("/v1/admin/requests?pageSize=20");
			const request = items.find((item) => item.threadId === threadId);
			if (request) {
				const details = await admin<Details>(
					`/v1/admin/requests/${request.id}`,
				);
				if (details.llmCalls.length) return details;
			}
			await Bun.sleep(500);
		}
		return { llmCalls: [] };
	}

	return {
		name: "orchestra + beta",
		tokensNote: deps.adminApiKey
			? "every model call of the request (Laya, delta, alpha-understand, beta) from /v1/admin/requests"
			: "reply model only (set ORCHESTRA_ADMIN_API_KEY to count Laya, delta and alpha-understand too)",
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
			let paused = { ms: 0 };
			let reply = "";
			let detail: Details | undefined;
			try {
				const token = await start(shop);
				const threadId = await thread(token, shop, paused);
				started = performance.now();
				paused = { ms: 0 };
				let response = await post(
					"/v1/widget/messages",
					{ threadId, text: test.text, lang: test.lang },
					visitor(token),
					paused,
				);
				let done: Extract<Line, { type: "done" }> | undefined;
				for (let trip = 0; trip < MAX_ROUND_TRIPS; trip++) {
					const stream = await lines(response);
					for (const line of stream)
						if (line.type === "delta") reply += line.text;
					const last = stream.at(-1);
					if (last?.type === "error") {
						const message = `${last.message}${last.hint ? ` (${last.hint})` : ""}`;
						// The provider behind the reply model is gone: not the orchestrator's doing.
						if (/no endpoints|unavailable|no provider/i.test(message))
							throw new InfraError("model-unavailable", message);
						throw new Error(message);
					}
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
							lang: test.lang,
						},
						visitor(token),
						paused,
					);
				}
				const latencyMs = performance.now() - started - paused.ms;

				if (deps.adminApiKey) {
					detail = await requestDetails(threadId);
					const calls = detail.llmCalls;
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
				return { ...base, latencyMs, reply, detail };
			} catch (error) {
				const infra = asInfra(error);
				return {
					...base,
					...(infra && {
						status: "error" as const,
						errorCategory: infra.category,
					}),
					latencyMs: performance.now() - started - paused.ms,
					reply,
					error:
						(infra ?? error) instanceof Error
							? ((infra ?? error) as Error).message
							: String(error),
				};
			}
		},
	};
}
