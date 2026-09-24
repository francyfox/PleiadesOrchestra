import type { AgentStreamEvent } from "@repo/core";

export interface HarnessClientConfig {
	baseURL: string;
	apiKey: string;
	fetchImpl?: typeof fetch;
}

export interface HarnessMessageRequest {
	threadId: string;
	/** External (channel-scoped) user id, e.g. the Telegram user id. */
	userId: string;
	text: string;
	channel: string;
	displayName?: string;
}

export interface AccessRequest {
	channel: string;
	externalUserId: string;
	displayName?: string;
}

export interface AccessResult {
	allowed: boolean;
	userId: string;
}

/**
 * The harness refused this user (blocked / not whitelisted / channel
 * disabled). Callers stay silent on it instead of showing an error.
 */
export class HarnessForbiddenError extends Error {
	constructor() {
		super("harness refused the user (403)");
		this.name = "HarnessForbiddenError";
	}
}

type HarnessStreamLine = AgentStreamEvent | { type: "error"; message: string };

export function createHarnessClient(config: HarnessClientConfig) {
	const fetchImpl = config.fetchImpl ?? fetch;
	const headers = {
		"content-type": "application/json",
		authorization: `Bearer ${config.apiKey}`,
	};

	return {
		/**
		 * Reads harness's NDJSON response line by line, decoding across
		 * arbitrary chunk boundaries (a network read can split a line
		 * anywhere). A `{"type":"error", ...}` line throws instead of
		 * being yielded — it's a transport-level failure, not an event.
		 */
		async *streamMessage(
			message: HarnessMessageRequest,
		): AsyncGenerator<AgentStreamEvent> {
			const response = await fetchImpl(`${config.baseURL}/v1/messages`, {
				method: "POST",
				headers,
				body: JSON.stringify(message),
			});

			if (response.status === 403) throw new HarnessForbiddenError();
			if (!response.ok) {
				throw new Error(
					`harness streamMessage failed: ${response.status} ${response.statusText}`,
				);
			}
			if (!response.body) {
				throw new Error("harness streamMessage failed: empty response body");
			}

			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let buffer = "";

			while (true) {
				const { done, value } = await reader.read();
				if (value) buffer += decoder.decode(value, { stream: true });

				// Index into `buffer` rather than `.slice()`-ing off each
				// consumed line — the old version copied the entire
				// remaining buffer on every line, not just once per read.
				let lineStart = 0;
				let newlineIndex = buffer.indexOf("\n", lineStart);
				while (newlineIndex !== -1) {
					const line = buffer.slice(lineStart, newlineIndex);
					lineStart = newlineIndex + 1;
					newlineIndex = buffer.indexOf("\n", lineStart);

					if (line.length > 0) {
						const event = JSON.parse(line) as HarnessStreamLine;
						if (event.type === "error") {
							throw new Error(event.message);
						}
						yield event;
					}
				}
				buffer = buffer.slice(lineStart);

				if (done) break;
			}
		},

		/** Registers the user with the harness (if new) and asks whether they're allowed to talk to it. */
		async checkAccess(request: AccessRequest): Promise<AccessResult> {
			const response = await fetchImpl(`${config.baseURL}/v1/access`, {
				method: "POST",
				headers,
				body: JSON.stringify(request),
			});

			if (!response.ok) {
				throw new Error(
					`harness checkAccess failed: ${response.status} ${response.statusText}`,
				);
			}
			return (await response.json()) as AccessResult;
		},

		async resetThread(threadId: string): Promise<void> {
			const response = await fetchImpl(
				`${config.baseURL}/v1/threads/${encodeURIComponent(threadId)}/reset`,
				{ method: "POST", headers },
			);

			if (!response.ok) {
				throw new Error(
					`harness resetThread failed: ${response.status} ${response.statusText}`,
				);
			}
		},
	};
}

export type HarnessClient = ReturnType<typeof createHarnessClient>;
