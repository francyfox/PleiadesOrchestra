import type { CustomerContext } from "src/lib/config/config.ts";
import type { WebMcpToolDescriptor } from "src/lib/webmcp/webmcp.ts";

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export type StreamEvent =
	| { type: "delta"; text: string }
	| {
			type: "done";
			elapsedMs?: number;
			inputTokens?: number;
			outputTokens?: number;
	  }
	/**
	 * What the assistant is doing right now, as text in the visitor's language
	 * ("Ищу «cheese»…"). A later `step` with the same `id` replaces the earlier
	 * one — it started, then finished or failed.
	 */
	| {
			type: "step";
			id: string;
			phase: "running" | "done" | "failed";
			text: string;
	  }
	/** The run is waiting on a browser-side WebMCP tool call — resume via `sendToolResult`. */
	| {
			type: "tool_call";
			tool: string;
			arguments: Record<string, unknown>;
			callId: string;
	  }
	| { type: "error"; message: string };

export interface HistoryItem {
	id: string;
	role: "user" | "assistant";
	content: string;
	createdAt: number;
}

export interface WidgetApi {
	createVisitor(): Promise<{ visitorToken: string; expiresAt: number }>;
	createThread(visitorToken: string): Promise<{ threadId: string }>;
	history(
		visitorToken: string,
		threadId: string,
	): Promise<{ items: HistoryItem[] }>;
	streamMessage(
		visitorToken: string,
		threadId: string,
		text: string,
		signal?: AbortSignal,
		customerContext?: CustomerContext,
		/** `pathname + search` of the visitor's page (see `currentPage`). */
		page?: string,
	): AsyncGenerator<StreamEvent>;
	/** Resumes a run that stopped on a `tool_call` event, once the browser has executed it. */
	sendToolResult(
		visitorToken: string,
		threadId: string,
		callId: string,
		tool: string,
		result: unknown,
		isError: boolean,
		signal?: AbortSignal,
		/** The page after the tool ran — a tool may have navigated. */
		page?: string,
	): AsyncGenerator<StreamEvent>;
	/**
	 * Registers this thread's current WebMCP tool catalog — called once when
	 * the panel opens (or the tool mode changes), not per message: a real
	 * catalog is several kB on its own, and reclassifying it through Laya on
	 * every single message was both wasteful and, combined with the size,
	 * what caused a `413` on the very first message. See
	 * docs/laya-autonomous-webmcp.md.
	 */
	registerWebMcpTools(
		visitorToken: string,
		threadId: string,
		webmcpTools: WebMcpToolDescriptor[],
		signal?: AbortSignal,
	): Promise<void>;
}

/** `status` is the HTTP status, or 0 when the request never got an answer (offline, CORS, DNS). */
export class ApiError extends Error {
	override name = "ApiError";
	constructor(readonly status: number) {
		super(status === 0 ? "network error" : `HTTP ${status}`);
	}
}

/** A deliberate `AbortController.abort()` (stop button or idle timeout) — never wrapped into `ApiError`, so callers can tell it apart from a real network failure. */
export function isAbortError(cause: unknown): boolean {
	return cause instanceof Error && cause.name === "AbortError";
}

interface ApiOptions {
	agentUrl: string;
	publishableKey: string;
	fetch?: FetchLike;
}

/**
 * The public Widget API (docs/admin-api.md): the publishable key is sent
 * only to obtain a visitor token; everything else carries the token. No
 * cookies are ever sent, so the server's Origin allowlist plus the token
 * are the whole trust boundary.
 */
export function createWidgetApi({
	agentUrl,
	publishableKey,
	fetch: fetchImpl,
}: ApiOptions): WidgetApi {
	const send: FetchLike = fetchImpl ?? ((url, init) => fetch(url, init));

	async function request(
		path: string,
		init: RequestInit & { headers: Record<string, string> },
	): Promise<Response> {
		let response: Response;
		try {
			response = await send(`${agentUrl}${path}`, {
				mode: "cors",
				credentials: "omit",
				cache: "no-store",
				...init,
			});
		} catch (cause) {
			if (isAbortError(cause)) throw cause;
			throw new ApiError(0);
		}
		if (!response.ok) throw new ApiError(response.status);
		return response;
	}

	const withToken = (
		visitorToken: string,
		extra: Record<string, string> = {},
	) => ({
		"x-visitor-token": visitorToken,
		...extra,
	});

	/** Shared by `streamMessage` and `sendToolResult` — both just POST a body and read back the same NDJSON line protocol. */
	async function* readNdjson(response: Response): AsyncGenerator<StreamEvent> {
		if (!response.body) throw new ApiError(0);
		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let buffer = "";
		try {
			while (true) {
				const { done, value } = await reader.read();
				if (value) buffer += decoder.decode(value, { stream: true });
				let newline = buffer.indexOf("\n");
				while (newline !== -1) {
					const line = buffer.slice(0, newline).trim();
					buffer = buffer.slice(newline + 1);
					if (line) yield JSON.parse(line) as StreamEvent;
					newline = buffer.indexOf("\n");
				}
				if (done) break;
			}
			const rest = buffer.trim();
			if (rest) yield JSON.parse(rest) as StreamEvent;
		} catch (cause) {
			if (cause instanceof SyntaxError || isAbortError(cause)) throw cause;
			throw new ApiError(0);
		} finally {
			reader.releaseLock();
		}
	}

	return {
		async createVisitor() {
			const response = await request("/v1/widget/visitors", {
				method: "POST",
				headers: { "x-publishable-key": publishableKey },
			});
			return (await response.json()) as {
				visitorToken: string;
				expiresAt: number;
			};
		},

		async createThread(visitorToken) {
			const response = await request("/v1/widget/threads", {
				method: "POST",
				headers: withToken(visitorToken),
			});
			return (await response.json()) as { threadId: string };
		},

		async history(visitorToken, threadId) {
			const response = await request(
				`/v1/widget/threads/${encodeURIComponent(threadId)}/messages`,
				{
					method: "GET",
					headers: withToken(visitorToken),
				},
			);
			return (await response.json()) as { items: HistoryItem[] };
		},

		async *streamMessage(
			visitorToken,
			threadId,
			text,
			signal,
			customerContext,
			page,
		) {
			const response = await request("/v1/widget/messages", {
				method: "POST",
				headers: withToken(visitorToken, {
					"content-type": "application/json",
				}),
				body: JSON.stringify({
					threadId,
					text,
					...(page ? { page } : {}),
					...(customerContext ? { customerContext } : {}),
				}),
				signal,
			});
			yield* readNdjson(response);
		},

		async *sendToolResult(
			visitorToken,
			threadId,
			callId,
			tool,
			result,
			isError,
			signal,
			page,
		) {
			const response = await request("/v1/widget/tool-results", {
				method: "POST",
				headers: withToken(visitorToken, {
					"content-type": "application/json",
				}),
				body: JSON.stringify({
					threadId,
					callId,
					tool,
					result,
					...(page ? { page } : {}),
					...(isError ? { isError: true } : {}),
				}),
				signal,
			});
			yield* readNdjson(response);
		},

		async registerWebMcpTools(visitorToken, threadId, webmcpTools, signal) {
			await request("/v1/widget/tools", {
				method: "POST",
				headers: withToken(visitorToken, {
					"content-type": "application/json",
				}),
				body: JSON.stringify({ threadId, webmcpTools }),
				signal,
			});
		},
	};
}
