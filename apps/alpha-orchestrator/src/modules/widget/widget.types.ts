import type { WebMcpToolDescriptor } from "@repo/core";
import type { UserRow } from "../users/users.types.ts";

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
	/** Messages per visitor token per minute. */
	messagesPerMinute: number;
	/** Messages per client IP per minute, across all visitors. */
	ipMessagesPerMinute: number;
	/** New visitor tokens per client IP per hour. */
	visitorsPerHourPerIp: number;
	/** Take the client IP from `X-Forwarded-For` (only behind a proxy you control). */
	trustProxy: boolean;
	/** Sliding visitor-token lifetime — same as the anonymous-user retention. */
	tokenTtlHours: number;
	/** Messages kept per user; re-applied after an identify merge. */
	retentionPerUser: number;
}

export const DEFAULT_WIDGET_OPTIONS: WidgetOptions = {
	maxTextChars: 2000,
	maxWebmcpToolsChars: 20_000,
	messagesPerMinute: 10,
	ipMessagesPerMinute: 30,
	visitorsPerHourPerIp: 20,
	trustProxy: false,
	tokenTtlHours: 24,
	retentionPerUser: 10,
};

/** What the widget needs from the reply machinery (see `modules/reply`). */
export interface WidgetReply {
	/** Runs the GOAP reply for an already-authorized user/thread (shared with /v1/messages). */
	startReply(
		user: UserRow,
		threadId: string,
		text: string,
		signal?: AbortSignal,
		customerContext?: CustomerContext,
	): ReadableStream<Uint8Array>;
	/**
	 * Resumes a run that stopped on a `tool_call` line once the widget has
	 * run the browser-side WebMCP tool and has its outcome.
	 */
	resumeReply(
		user: UserRow,
		threadId: string,
		toolResult: { tool: string; isError: boolean },
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
