export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface AskInput {
	channel: string;
	threadId: string;
	userId: string;
	text: string;
}

export interface Usage {
	elapsedMs?: number;
	inputTokens?: number;
	outputTokens?: number;
}

export type AskResult =
	| { ok: true; answer: string; usage: Usage }
	| { ok: false; message: string };

export interface Harness {
	ask(input: AskInput): Promise<AskResult>;
}

interface HarnessConfig {
	baseURL: string;
	apiKey: string;
	fetch?: FetchLike;
}

type Line =
	| { type: "delta"; text: string }
	| ({ type: "done" } & Usage)
	| { type: "error"; message: string };

/**
 * Client of the orchestrator's `POST /v1/messages` (NDJSON: `delta` lines,
 * then `done` or `error`). Collects the whole reply — an MCP tool result
 * isn't streamed. Never throws: every failure becomes `{ ok: false }`.
 */
export function createHarness(config: HarnessConfig): Harness {
	const send: FetchLike = config.fetch ?? ((url, init) => fetch(url, init));

	return {
		async ask(input) {
			try {
				const response = await send(`${config.baseURL}/v1/messages`, {
					method: "POST",
					headers: {
						"content-type": "application/json",
						authorization: `Bearer ${config.apiKey}`,
					},
					body: JSON.stringify(input),
				});
				if (response.status === 403) {
					return {
						ok: false,
						message: "harness: access denied for this user or channel",
					};
				}
				if (!response.ok || !response.body) {
					return { ok: false, message: `harness: HTTP ${response.status}` };
				}
				return await readReply(response.body);
			} catch (error) {
				return {
					ok: false,
					message: `harness unreachable: ${error instanceof Error ? error.message : String(error)}`,
				};
			}
		},
	};
}

async function readReply(body: ReadableStream<Uint8Array>): Promise<AskResult> {
	const reader = body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";
	let answer = "";
	let usage: Usage | undefined;

	const handle = (raw: string): AskResult | undefined => {
		if (!raw) return;
		const line = JSON.parse(raw) as Line;
		if (line.type === "delta") answer += line.text;
		else if (line.type === "error") return { ok: false, message: line.message };
		else if (line.type === "done") {
			usage = {
				elapsedMs: line.elapsedMs,
				inputTokens: line.inputTokens,
				outputTokens: line.outputTokens,
			};
		}
	};

	while (true) {
		const { done, value } = await reader.read();
		if (value) buffer += decoder.decode(value, { stream: true });
		let newline = buffer.indexOf("\n");
		while (newline !== -1) {
			const failed = handle(buffer.slice(0, newline));
			if (failed) return failed;
			buffer = buffer.slice(newline + 1);
			newline = buffer.indexOf("\n");
		}
		if (done) break;
	}
	const failed = handle(buffer.trim());
	if (failed) return failed;
	return { ok: true, answer, usage: usage ?? {} };
}
