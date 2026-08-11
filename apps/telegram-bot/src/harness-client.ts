import type { AgentStreamEvent } from "@repo/core";

export interface HarnessClientConfig {
	baseURL: string;
	apiKey: string;
	fetchImpl?: typeof fetch;
}

export interface HarnessMessageRequest {
	threadId: string;
	userId: string;
	text: string;
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

				let newlineIndex = buffer.indexOf("\n");
				while (newlineIndex !== -1) {
					const line = buffer.slice(0, newlineIndex);
					buffer = buffer.slice(newlineIndex + 1);
					newlineIndex = buffer.indexOf("\n");

					if (line.length === 0) continue;
					const event = JSON.parse(line) as HarnessStreamLine;
					if (event.type === "error") {
						throw new Error(event.message);
					}
					yield event;
				}

				if (done) break;
			}
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
