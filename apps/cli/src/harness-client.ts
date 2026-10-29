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
				body: JSON.stringify({ ...message, channel: "cli" }),
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

		/** One message straight to a language agent's model (`model` = the agent id), no planner. */
		async complete(
			agent: string,
			text: string,
		): Promise<{ text: string; inputTokens?: number; outputTokens?: number }> {
			const response = await fetchImpl(
				`${config.baseURL}/v1/chat/completions`,
				{
					method: "POST",
					headers,
					body: JSON.stringify({
						model: agent,
						messages: [{ role: "user", content: text }],
					}),
				},
			);
			if (!response.ok) {
				throw new Error(
					`harness complete failed: ${response.status} ${response.statusText}`,
				);
			}
			const body = (await response.json()) as {
				choices?: { message?: { content?: string } }[];
				usage?: { prompt_tokens?: number; completion_tokens?: number };
			};
			return {
				text: body.choices?.[0]?.message?.content ?? "",
				inputTokens: body.usage?.prompt_tokens,
				outputTokens: body.usage?.completion_tokens,
			};
		},

		/** Typed decision questions answered by the decision agent (gamma). */
		async decide(
			state: unknown,
			questions: Record<string, unknown>,
		): Promise<Record<string, unknown>> {
			const response = await fetchImpl(`${config.baseURL}/v1/decisions`, {
				method: "POST",
				headers,
				body: JSON.stringify({ state, questions }),
			});
			if (!response.ok) {
				throw new Error(
					`harness decide failed: ${response.status} ${response.statusText}`,
				);
			}
			return ((await response.json()) as { answers: Record<string, unknown> })
				.answers;
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
