import { swagger } from "@elysiajs/swagger";
import type {
	Agent,
	DecisionAgent,
	DecisionQuestion,
	GoapAction,
	PlanTraceEvent,
	WorldState,
} from "@repo/core";
import { createTextAction, runPlan } from "@repo/core";
import { Elysia, t } from "elysia";
import { isAllowed } from "./access.ts";
import { adminRoutes } from "./admin/routes.ts";
import { chunkText } from "./chunk.ts";
import type { Db } from "./db/client.ts";
import {
	type ChannelDirectory,
	resolveThreadId,
	threadIdsByExternal,
	type UserRow,
	upsertIdentifiedUser,
} from "./db/identity.ts";
import { finishPlanRun, startPlanRun } from "./db/plan-trace.ts";
import type { RunBinding } from "./db/run-binding.ts";
import { normalizeText } from "./normalize.ts";
import {
	DEFAULT_WIDGET_OPTIONS,
	isPublicWidgetPath,
	type WidgetOptions,
	widgetRoutes,
} from "./widget/routes.ts";

export type { WidgetOptions } from "./widget/routes.ts";

export interface ServerDeps {
	agent: Agent;
	decisionAgent: DecisionAgent;
	/** Transport secret (telegram-bot, cli, shop backends). */
	apiKey: string;
	/** Separate secret for /v1/admin/* (apps/admin's server side). */
	adminApiKey: string;
	maxChunkChars: number;
	db: Db;
	channels: ChannelDirectory;
	/** Shared with the history store / usage recorder so their writes get linked to the running plan. */
	runs: RunBinding;
	/** Flushed once a message's stream is done — `SqliteUsageRecorder` in production. */
	usageRecorder?: { flush(): void };
	ipHashSalt: string;
	/** Shop-widget limits and settings; unset fields use `DEFAULT_WIDGET_OPTIONS`. */
	widget?: Partial<WidgetOptions>;
	now?: () => number;
	/** Where persistence errors after a response go; they never break the stream. */
	onError?: (error: unknown) => void;
}

const DEFAULT_CHANNEL = "cli";

const MessageBody = t.Object({
	threadId: t.String(),
	/** External user id within the channel. */
	userId: t.String(),
	text: t.String(),
	channel: t.Optional(t.String()),
	displayName: t.Optional(t.String()),
});

const AccessBody = t.Object({
	channel: t.String(),
	externalUserId: t.String(),
	displayName: t.Optional(t.String()),
});

const DecisionsBody = t.Object({
	state: t.Unknown(),
	questions: t.Record(t.String(), t.Unknown()),
});

const encoder = new TextEncoder();

function ndjsonLine(value: unknown): Uint8Array {
	return encoder.encode(`${JSON.stringify(value)}\n`);
}

/** Default goal for `/v1/messages` — the only thing Phase 5 of the GOAP plan wires up so far. A domain-specific goal (derived from classified intent, once Laya-actions are in this catalog too) is future work, not this phase's scope. */
const REPLY_GOAL = { replied: true };

/**
 * The GOAP action catalog for `/v1/messages`. Just one action right now —
 * wraps the existing `Agent` port exactly as it was called before the
 * planner existed — proving the wiring works without inventing the real
 * domain's action set yet (see the plan doc's open questions). Built once
 * per app instance, not per request: nothing here depends on a specific
 * request's data, only on `deps`.
 */
function buildActions(deps: ServerDeps): GoapAction[] {
	return [
		createTextAction({
			name: "generateReply",
			// Only action in the catalog right now, so its cost doesn't yet
			// compete against anything — set for when Laya-actions/tools join it.
			cost: 5,
			preconditions: {},
			effects: { replied: true },
			agent: deps.agent,
			toChunks: (state) =>
				chunkText(String(state.userMessage ?? ""), deps.maxChunkChars),
			threadId: (state) => String(state.threadId ?? ""),
			userId: (state) => String(state.userId ?? ""),
			toEffects: (replyText, meta) => ({
				replied: true,
				replyText,
				elapsedMs: meta.elapsedMs,
				inputTokens: meta.inputTokens,
				outputTokens: meta.outputTokens,
				totalInputTokens: meta.totalInputTokens,
				totalOutputTokens: meta.totalOutputTokens,
			}),
		}),
	];
}

function numberOrUndefined(value: WorldState[string]): number | undefined {
	return typeof value === "number" ? value : undefined;
}

interface RunContext {
	planRunId: string;
	threadId: string;
}

/**
 * NDJSON body: one JSON object per line. `delta` streams live as the
 * underlying `Agent` generates text (via the text-action's `onDelta` — see
 * `packages/core/src/goap/text-action.ts`), so `runPlan` resolving fully
 * before anything is sent doesn't cost time-to-first-token. `done` carries
 * the same `elapsedMs`/`inputTokens`/`outputTokens` shape the old direct
 * `Agent.handleMessageStream` wiring did (read back off `finalState`, where
 * `generateReply`'s `toEffects` put them) — `apps/cli`'s usage line depends
 * on that shape, not just this endpoint's own callers. `error` covers both
 * an action throwing mid-run and the planner failing to reach the goal at
 * all — a transport-level failure either way, not a `GoapAction`.
 *
 * Trace events and usage records are buffered during the run and written
 * after the stream is closed — no SQLite write while tokens are streaming.
 */
function streamPlanRun(
	deps: ServerDeps,
	actions: GoapAction[],
	initialState: WorldState,
	run: RunContext,
): ReadableStream<Uint8Array> {
	const now = deps.now ?? Date.now;
	return new ReadableStream({
		async start(controller) {
			const startedAt = now();
			const events: PlanTraceEvent[] = [];
			let succeeded = false;
			try {
				const result = await runPlan({
					state: initialState,
					goal: REPLY_GOAL,
					actions,
					tracer: (event) => {
						events.push(event);
					},
					ctx: {
						onDelta: (text: string) => {
							controller.enqueue(ndjsonLine({ type: "delta", text }));
						},
					},
				});
				succeeded = result.succeeded;

				if (!result.succeeded) {
					controller.enqueue(
						ndjsonLine({
							type: "error",
							message: "no plan reached the goal",
						}),
					);
				} else {
					const { finalState } = result;
					controller.enqueue(
						ndjsonLine({
							type: "done",
							elapsedMs:
								numberOrUndefined(finalState.elapsedMs) ?? now() - startedAt,
							inputTokens: numberOrUndefined(finalState.inputTokens),
							outputTokens: numberOrUndefined(finalState.outputTokens),
							totalInputTokens: numberOrUndefined(finalState.totalInputTokens),
							totalOutputTokens: numberOrUndefined(
								finalState.totalOutputTokens,
							),
						}),
					);
				}
			} catch (error) {
				controller.enqueue(
					ndjsonLine({
						type: "error",
						message: error instanceof Error ? error.message : String(error),
					}),
				);
			} finally {
				// `done`/`error` is already enqueued, so the client has the full
				// answer; the one short transaction below only delays the
				// stream's end marker, and keeps "response finished ⇒ persisted".
				deps.runs.unbind(run.threadId);
				try {
					finishPlanRun(deps.db, run.planRunId, {
						succeeded,
						durationMs: now() - startedAt,
						events,
					});
					deps.usageRecorder?.flush();
				} catch (error) {
					deps.onError?.(error);
				}
				controller.close();
			}
		},
	});
}

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Builds the Elysia app. Kept separate from index.ts so tests can call
 * `app.handle(request)` directly, without an actual listening port or LLM call.
 */
export function createApp(deps: ServerDeps) {
	const actions = buildActions(deps);
	const now = deps.now ?? Date.now;

	/** Starts the GOAP reply for an already-authorized user and internal thread. */
	const startReply = (
		user: UserRow,
		threadId: string,
		text: string,
	): ReadableStream<Uint8Array> => {
		const planRunId = crypto.randomUUID();
		startPlanRun(deps.db, {
			id: planRunId,
			userId: user.id,
			threadId,
			goal: REPLY_GOAL,
			createdAt: now(),
		});
		deps.runs.bind(threadId, planRunId);

		const initialState: WorldState = {
			userMessage: normalizeText.apply(text),
			threadId,
			userId: user.id,
			planRunId,
		};
		return streamPlanRun(deps, actions, initialState, { planRunId, threadId });
	};

	return new Elysia()
		.use(swagger({ path: "/swagger" }))
		.onRequest(({ request, set }) => {
			const pathname = new URL(request.url).pathname;
			// Health checks stay unauthenticated — a container orchestrator (or
			// anyone else polling liveness) shouldn't need the shared secret for that.
			// Swagger docs are also unauthenticated so the API is discoverable
			// (e.g. by the Chrome extension) without a token in hand yet.
			if (pathname === "/health" || pathname.startsWith("/swagger")) return;
			// The shop widget is public (publishable key + visitor token + Origin)
			// and `identify` uses the channel's own secret — both checked in
			// widget/routes.ts, never the transport or admin key.
			if (isPublicWidgetPath(pathname)) return;

			const authorization = request.headers.get("authorization");
			// Two disjoint secrets: the transport key never reaches /v1/admin/*
			// and the admin key never reaches the transport routes.
			if (pathname === "/v1/admin" || pathname.startsWith("/v1/admin/")) {
				if (authorization !== `Bearer ${deps.adminApiKey}`) {
					set.status = 401;
					return "Unauthorized";
				}
				if (
					MUTATING_METHODS.has(request.method) &&
					!request.headers.get("x-admin-id")
				) {
					set.status = 400;
					return "X-Admin-Id header required";
				}
				return;
			}

			if (authorization !== `Bearer ${deps.apiKey}`) {
				set.status = 401;
				return "Unauthorized";
			}
		})
		.get("/health", () => "ok")
		.post(
			"/v1/access",
			({ body, status }) => {
				const channel = deps.channels.bySlug(body.channel);
				if (!channel) return status(404, "Unknown channel");
				const user = upsertIdentifiedUser(
					deps.db,
					channel.id,
					body.externalUserId,
					body.displayName,
					now(),
				);
				return { allowed: isAllowed(channel, user), userId: user.id };
			},
			{ body: AccessBody },
		)
		.post(
			"/v1/messages",
			({ body, status }) => {
				const channel = deps.channels.bySlug(body.channel ?? DEFAULT_CHANNEL);
				if (!channel) return status(404, "Unknown channel");

				const timestamp = now();
				const user = upsertIdentifiedUser(
					deps.db,
					channel.id,
					body.userId,
					body.displayName,
					timestamp,
				);
				// Denied users get silence: an empty 403, and the model is never called.
				if (!isAllowed(channel, user)) {
					return new Response(null, { status: 403 });
				}

				const threadId = resolveThreadId(
					deps.db,
					channel.id,
					user.id,
					body.threadId,
					timestamp,
				);
				const stream = startReply(user, threadId, body.text);

				return new Response(stream, {
					headers: { "content-type": "application/x-ndjson" },
				});
			},
			{ body: MessageBody },
		)
		.post(
			"/v1/threads/:id/reset",
			async ({ params, query }) => {
				const channelId = query.channel
					? deps.channels.bySlug(query.channel)?.id
					: undefined;
				// The external id is ambiguous across channels/users (threads are
				// per user); without `?channel=` every matching thread is reset.
				for (const threadId of threadIdsByExternal(
					deps.db,
					params.id,
					channelId,
				)) {
					await deps.agent.resetThread(threadId);
				}
				return new Response(null, { status: 204 });
			},
			{ query: t.Object({ channel: t.Optional(t.String()) }) },
		)
		.post(
			"/v1/decisions",
			async ({ body }) => {
				// The pre-existing `tsc`/Elysia body-inference issue (reproduces on
				// unmodified HEAD, unrelated to this route) collapses `body` to
				// `unknown` here regardless — this cast documents the trust boundary
				// the runtime schema (`DecisionsBody`) actually validates at request time.
				const { state, questions } = body as {
					state: unknown;
					questions: Record<string, DecisionQuestion>;
				};
				const answers = await deps.decisionAgent.decide(state, questions);
				return { answers };
			},
			{ body: DecisionsBody },
		)
		.use(
			widgetRoutes({
				db: deps.db,
				channels: deps.channels,
				ipHashSalt: deps.ipHashSalt,
				now,
				options: { ...DEFAULT_WIDGET_OPTIONS, ...deps.widget },
				startReply,
			}),
		)
		.use(
			adminRoutes({
				db: deps.db,
				channels: deps.channels,
				actions,
				ipHashSalt: deps.ipHashSalt,
				now,
			}),
		);
}
