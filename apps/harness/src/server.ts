import type { Agent } from "@repo/core";
import { chunkText } from "./chunk.ts";
import { normalizeText } from "./normalize.ts";

export interface ServerDeps {
	agent: Agent;
	apiKey: string;
	maxChunkChars: number;
}

interface MessageRequestBody {
	threadId: string;
	userId: string;
	text: string;
}

function isMessageRequestBody(value: unknown): value is MessageRequestBody {
	if (typeof value !== "object" || value === null) return false;
	const body = value as Record<string, unknown>;
	return (
		typeof body.threadId === "string" &&
		typeof body.userId === "string" &&
		typeof body.text === "string"
	);
}

function isAuthorized(request: Request, apiKey: string): boolean {
	return request.headers.get("authorization") === `Bearer ${apiKey}`;
}

const RESET_THREAD_PATH = /^\/v1\/threads\/([^/]+)\/reset$/;

function ndjsonLine(value: unknown): Uint8Array {
	return new TextEncoder().encode(`${JSON.stringify(value)}\n`);
}

/**
 * NDJSON body: one JSON object per line, straight from `Agent.handleMessageStream`
 * (`progress`/`delta`/`done`), plus a transport-only `error` line if the agent
 * throws mid-stream — the connection stays open long enough to say why instead
 * of just dying.
 */
function streamAgentEvents(
	agent: Agent,
	message: Parameters<Agent["handleMessageStream"]>[0],
): ReadableStream<Uint8Array> {
	return new ReadableStream({
		async start(controller) {
			try {
				for await (const event of agent.handleMessageStream(message)) {
					controller.enqueue(ndjsonLine(event));
				}
			} catch (error) {
				controller.enqueue(
					ndjsonLine({
						type: "error",
						message: error instanceof Error ? error.message : String(error),
					}),
				);
			} finally {
				controller.close();
			}
		},
	});
}

/**
 * Plain (request: Request) => Promise<Response> handler — same shape Bun.serve's
 * `fetch` option expects. Kept separate from index.ts so tests can call it
 * directly against a fake `Agent`, without an actual listening port or LLM call.
 */
export function createFetchHandler(deps: ServerDeps) {
	return async function handleRequest(request: Request): Promise<Response> {
		const url = new URL(request.url);

		if (request.method === "GET" && url.pathname === "/health") {
			return new Response("ok");
		}

		if (!isAuthorized(request, deps.apiKey)) {
			return new Response("Unauthorized", { status: 401 });
		}

		if (request.method === "POST" && url.pathname === "/v1/messages") {
			let body: unknown;
			try {
				body = await request.json();
			} catch {
				return new Response("Invalid JSON", { status: 400 });
			}

			if (!isMessageRequestBody(body)) {
				return new Response("Invalid body", { status: 400 });
			}

			const chunks = chunkText(
				normalizeText.apply(body.text),
				deps.maxChunkChars,
			);

			const stream = streamAgentEvents(deps.agent, {
				threadId: body.threadId,
				userId: body.userId,
				chunks,
			});

			return new Response(stream, {
				headers: { "content-type": "application/x-ndjson" },
			});
		}

		const resetMatch = url.pathname.match(RESET_THREAD_PATH);
		if (request.method === "POST" && resetMatch?.[1]) {
			deps.agent.resetThread(decodeURIComponent(resetMatch[1]));
			return new Response(null, { status: 204 });
		}

		return new Response("Not found", { status: 404 });
	};
}
