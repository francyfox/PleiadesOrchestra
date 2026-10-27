import type { GoapAction, WebMcpToolDescriptor } from "@repo/core";
import {
	createProductRequestAction,
	createWebMcpActions,
	pruneUnproducibleFacts,
	UntranslatableError,
} from "@repo/core";
import { REPLY_GOAL } from "../goap/goap.service.ts";
import { hashTools } from "../mcp/mcp.service.ts";
import { joinRequest, startPlanRun } from "../plan-runs/plan-runs.service.ts";
import { errorMessage } from "../run-stream/run-stream.service.ts";
import { streamPlanRun } from "../run-stream/run-stream.ts";
import type { PreparedRun } from "../run-stream/run-stream.types.ts";
import { encodeNdjsonLine } from "../streaming/streaming.service.ts";
import { readQueue } from "../tasks/tasks.service.ts";
import type { VisitorRow } from "../visitors/visitors.types.ts";
import type {
	ReplyOptions,
	ToolOutcome,
	WidgetReply,
} from "../widget/widget.types.ts";
import {
	cancelWait,
	prepareNewMessage,
	prepareNextTask,
	prepareResume,
} from "./reply.service.ts";
import type { ReplyDeps } from "./reply.types.ts";

/** Catalogs kept classified at once: sites are few, their catalogs rarely change. */
const CLASSIFIED_CACHE_SIZE = 32;

/** Starts, resumes and prepares GOAP replies. Shared by `/v1/messages` and the widget. */
export class ReplyService implements WidgetReply {
	/** Classified catalogs by `hashTools`, least recently used first. Actions hold no per-thread state. */
	private readonly classified = new Map<string, GoapAction[]>();

	/** Catalogs still being classified, by thread: a reply waits for its thread's. */
	private readonly pending = new Map<string, Promise<void>>();

	constructor(private readonly deps: ReplyDeps) {}

	/** Starts the GOAP reply for an already-authorized visitor and internal thread. */
	startReply(
		visitor: VisitorRow,
		threadId: string,
		text: string,
		options: ReplyOptions = {},
	): ReadableStream<Uint8Array> {
		return this.openStream(
			visitor,
			threadId,
			options.signal,
			(planRunId) =>
				prepareNewMessage(
					this.deps,
					visitor,
					threadId,
					planRunId,
					text,
					options,
				),
			text,
		);
	}

	/** Resumes a run that stopped on a WebMCP tool call, once the browser has run the tool. */
	resumeReply(
		visitor: VisitorRow,
		threadId: string,
		toolResult: ToolOutcome,
		signal?: AbortSignal,
	): ReadableStream<Uint8Array> {
		if (toolResult.cancelled)
			return this.cancelStream(visitor, threadId, toolResult);
		return this.openStream(visitor, threadId, signal, (planRunId) =>
			prepareResume(this.deps, threadId, planRunId, toolResult),
		);
	}

	/** One `cancelled` line (or an in-band error for a call that is not the awaited one); no model is called. */
	private cancelStream(
		visitor: VisitorRow,
		threadId: string,
		toolResult: ToolOutcome,
	): ReadableStream<Uint8Array> {
		const { deps } = this;
		return new ReadableStream({
			async start(controller) {
				try {
					await deps.runLock.withLock(threadId, () =>
						cancelWait(deps, visitor, threadId, toolResult),
					);
					controller.enqueue(encodeNdjsonLine({ type: "cancelled" }));
				} catch (error) {
					controller.enqueue(
						encodeNdjsonLine({ type: "error", message: errorMessage(error) }),
					);
				} finally {
					controller.close();
				}
			},
		});
	}

	/**
	 * Classifies a widget-supplied WebMCP tool list once (through the decision
	 * model) and caches it for the thread's later messages, together with the
	 * step that reads "what to buy" out of the message. Preconditions no action
	 * can satisfy (a site with one store has no "choose a store") are dropped.
	 * An empty list clears the thread's entry, so nothing stale is left behind.
	 */
	registerWebMcpTools(
		threadId: string,
		tools: WebMcpToolDescriptor[],
		channelId?: string,
	): Promise<void> {
		const work = this.classifyTools(threadId, tools, channelId);
		const tracked = work.catch((error) => this.deps.onError?.(error));
		this.pending.set(threadId, tracked);
		void tracked.then(() => {
			if (this.pending.get(threadId) === tracked) this.pending.delete(threadId);
		});
		return work;
	}

	private async classifyTools(
		threadId: string,
		tools: WebMcpToolDescriptor[],
		channelId?: string,
	): Promise<void> {
		const {
			webmcpCatalog,
			decisionAgent,
			productRequestAgent,
			functionCallAgent,
		} = this.deps;
		if (tools.length === 0) {
			webmcpCatalog.delete(threadId);
			return;
		}
		// The same catalog (a panel opened again, another visitor of the same
		// page) was classified already: classifying costs one Laya call per tool.
		// The presets are part of what a tool means: the same tools of two channels classify apart.
		const taxonomy = channelId ? this.deps.taxonomy?.(channelId) : undefined;
		const hash = `${hashTools(tools)}:${taxonomy?.presets.join(",") ?? ""}`;
		const cached = this.classified.get(hash);
		if (cached) {
			this.classified.delete(hash);
			this.classified.set(hash, cached); // most recently used last
			webmcpCatalog.set(threadId, cached);
			return;
		}
		let toolActions: GoapAction[];
		try {
			toolActions = await createWebMcpActions({
				tools,
				decisionAgent,
				...(taxonomy ? { taxonomy } : {}),
				functionCallAgent,
				onError: this.deps.onError,
				usageRecorder: this.deps.usageRecorder?.record
					? {
							record: this.deps.usageRecorder.record.bind(
								this.deps.usageRecorder,
							),
						}
					: undefined,
			});
		} catch (error) {
			// Laya reads English only and the site's tool text could not be
			// translated yet (translator still loading): no catalog now, not a
			// wrong one remembered; the next registration classifies it again.
			if (!(error instanceof UntranslatableError)) throw error;
			webmcpCatalog.delete(threadId);
			this.deps.onError?.(error);
			return;
		}
		const parseRequest = productRequestAgent
			? [createProductRequestAction({ agent: productRequestAgent })]
			: [];
		const catalog = pruneUnproducibleFacts([...toolActions, ...parseRequest]);
		webmcpCatalog.set(threadId, catalog);
		this.classified.set(hash, catalog);
		if (this.classified.size > CLASSIFIED_CACHE_SIZE) {
			const oldest = this.classified.keys().next().value;
			if (oldest !== undefined) this.classified.delete(oldest);
		}
	}

	/**
	 * Creates the `plan_runs` row and binds it to the thread, then streams the
	 * run. `planRunId` is made here (not inside `prepare`) because the trace
	 * row needs it up front, and `prepare` needs it too — the text action reads
	 * `state.planRunId` to link usage records to the run.
	 */
	private openStream(
		visitor: VisitorRow,
		threadId: string,
		signal: AbortSignal | undefined,
		prepare: (planRunId: string) => Promise<PreparedRun>,
		prompt?: string,
	): ReadableStream<Uint8Array> {
		const { deps } = this;
		const planRunId = crypto.randomUUID();
		startPlanRun(deps.db, {
			id: planRunId,
			visitorId: visitor.id,
			threadId,
			// Best-effort base goal for the trace row; the goal the run really uses
			// (extended by classification, or the one a resumed run was pursuing)
			// is only known once the stream starts.
			goal: REPLY_GOAL,
			createdAt: deps.now(),
			prompt,
		});
		deps.runs.bind(threadId, planRunId);
		return streamPlanRun(deps, {
			run: { planRunId, threadId },
			signal,
			prepare: async () => {
				// The widget does not wait for the catalog's classification.
				await this.pending.get(threadId);
				return prepare(planRunId);
			},
			// The next task of a queue: its own run of the same request.
			next: async (finished) => {
				const nextId = crypto.randomUUID();
				const task = readQueue(finished.prepared.state)[0];
				startPlanRun(deps.db, {
					id: nextId,
					visitorId: visitor.id,
					threadId,
					goal: REPLY_GOAL,
					createdAt: deps.now(),
					prompt: task?.text,
				});
				joinRequest(deps.db, nextId, finished.run.planRunId);
				deps.runs.bind(threadId, nextId);
				return {
					run: { planRunId: nextId, threadId },
					prepare: () =>
						prepareNextTask(deps, visitor, threadId, nextId, finished),
				};
			},
		});
	}
}
