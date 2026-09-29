import type { CustomerContext } from "./config";

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export type StreamEvent =
	| { type: "delta"; text: string }
	| {
			type: "done";
			elapsedMs?: number;
			inputTokens?: number;
			outputTokens?: number;
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
	): AsyncGenerator<StreamEvent>;
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
		) {
			const response = await request("/v1/widget/messages", {
				method: "POST",
				headers: withToken(visitorToken, {
					"content-type": "application/json",
				}),
				body: JSON.stringify({
					threadId,
					text,
					...(customerContext ? { customerContext } : {}),
				}),
				signal,
			});
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
		},
	};
}
