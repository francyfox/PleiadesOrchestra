import type { Agent } from "@repo/core";
import { Elysia, t } from "elysia";
import { chunkText } from "./chunk.ts";
import { normalizeText } from "./normalize.ts";

export interface ServerDeps {
	agent: Agent;
	apiKey: string;
	maxChunkChars: number;
}

const MessageBody = t.Object({
	threadId: t.String(),
	userId: t.String(),
	text: t.String(),
});

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
 * Builds the Elysia app. Kept separate from index.ts so tests can call
 * `app.handle(request)` directly, without an actual listening port or LLM call.
 */
export function createApp(deps: ServerDeps) {
	return new Elysia()
		.onRequest(({ request, set }) => {
			// Health checks stay unauthenticated — Railway (and anyone else
			// polling liveness) shouldn't need the shared secret for that.
			if (new URL(request.url).pathname === "/health") return;

			if (request.headers.get("authorization") !== `Bearer ${deps.apiKey}`) {
				set.status = 401;
				return "Unauthorized";
			}
		})
		.get("/health", () => "ok")
		.post(
			"/v1/messages",
			({ body }) => {
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
			},
			{ body: MessageBody },
		)
		.post("/v1/threads/:id/reset", ({ params }) => {
			deps.agent.resetThread(params.id);
			return new Response(null, { status: 204 });
		});
}
