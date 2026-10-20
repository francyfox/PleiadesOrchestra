import type { WebMcpToolDescriptor } from "@repo/core";
import type { ClientIpSource } from "@repo/elysia-kit";
import type { VisitorRow } from "../visitors/visitors.types.ts";

export type CustomerContext = Record<string, string | number | boolean>;

export interface WidgetOptions {
	/** Longest accepted message text (characters). */
	maxTextChars: number;
	/**
	 * Longest accepted serialized WebMCP tool catalog (characters), on
	 * `POST /v1/widget/tools`. Sent once per panel-open, not per message, so
	 * it can be much bigger than `maxTextChars`.
	 */
	maxWebmcpToolsChars: number;
	/**
	 * Longest accepted request body (bytes) on `/v1/widget/*`, judged by its
	 * `Content-Length`. Bun's server-wide `maxRequestBodySize` is the backstop
	 * for bodies that don't announce a length.
	 */
	maxBodyBytes: number;
	/** Threads one visitor token may create per hour. */
	threadsPerHour: number;
	/** Threads whose classified WebMCP catalog is kept in memory at once (LRU). */
	maxCatalogThreads: number;
	/** Messages per visitor token per minute. */
	messagesPerMinute: number;
	/** Messages per client IP per minute, across all visitors. */
	ipMessagesPerMinute: number;
	/**
	 * Tool results per visitor token per minute. Not counted as messages: one
	 * request can fan out into a call per item («очисти корзину» on a 12-line
	 * cart is 13 browser round trips), and each result only continues a run the
	 * visitor already started (it must answer the call the run awaits).
	 */
	toolResultsPerMinute: number;
	/** New visitor tokens per client IP per hour. */
	visitorsPerHourPerIp: number;
	/** Where the client IP comes from (see `resolveClientIp`). */
	clientIpSource: ClientIpSource;
	/** `xff-rightmost` only: trusted proxies appending to `X-Forwarded-For`. */
	trustedProxyHops: number;
	/** Sliding visitor-token lifetime — same as the anonymous-visitor retention. */
	tokenTtlHours: number;
	/** Messages kept per visitor; re-applied after an identify merge. */
	retentionPerUser: number;
}

export const DEFAULT_WIDGET_OPTIONS: WidgetOptions = {
	maxTextChars: 2000,
	maxWebmcpToolsChars: 20_000,
	maxBodyBytes: 131_072,
	threadsPerHour: 30,
	maxCatalogThreads: 1000,
	messagesPerMinute: 10,
	ipMessagesPerMinute: 30,
	toolResultsPerMinute: 120,
	visitorsPerHourPerIp: 20,
	clientIpSource: "socket",
	trustedProxyHops: 1,
	tokenTtlHours: 24,
	retentionPerUser: 10,
};

/** Longest page path+query the widget may send (it cuts at the same length). */
export const MAX_PAGE_CHARS = 512;

/** Per-request extras of a reply. */
export interface ReplyOptions {
	/** Stops the run when the client disconnects. */
	signal?: AbortSignal;
	customerContext?: CustomerContext;
	/** Path and query of the page the visitor is on (`/ru/store/a?q=milk`), as their browser shows it. */
	page?: string;
}

/** What a browser-side tool reported back. */
export interface ToolOutcome {
	/** The `callId` of the `tool_call` line this answers (the id of the run that issued it). */
	callId: string;
	tool: string;
	isError: boolean;
	result?: unknown;
	/** The page the visitor is on after the tool ran — a tool may have navigated. */
	page?: string;
}

/** What the widget needs from the reply machinery (see `modules/reply`). */
export interface WidgetReply {
	/** Runs the GOAP reply for an already-authorized visitor/thread (shared with /v1/messages). */
	startReply(
		visitor: VisitorRow,
		threadId: string,
		text: string,
		options?: ReplyOptions,
	): ReadableStream<Uint8Array>;
	/**
	 * Resumes a run that stopped on a `tool_call` line once the widget has
	 * run the browser-side WebMCP tool and has its outcome.
	 */
	resumeReply(
		visitor: VisitorRow,
		threadId: string,
		toolResult: ToolOutcome,
		signal?: AbortSignal,
	): ReadableStream<Uint8Array>;
	/**
	 * Classifies and caches a WebMCP tool catalog for a thread, called once
	 * when the widget's panel opens; later replies on that thread pick it up.
	 */
	registerWebMcpTools(
		threadId: string,
		tools: WebMcpToolDescriptor[],
	): Promise<void>;
}
