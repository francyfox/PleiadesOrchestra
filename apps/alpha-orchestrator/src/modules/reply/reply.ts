import type { GoapAction, WebMcpToolDescriptor } from "@repo/core";
import {
	createProductRequestAction,
	createWebMcpActions,
	pruneUnproducibleFacts,
} from "@repo/core";
import { REPLY_GOAL } from "../goap/goap.service.ts";
import { hashTools } from "../mcp/mcp.service.ts";
import { startPlanRun } from "../plan-runs/plan-runs.service.ts";
import { streamPlanRun } from "../run-stream/run-stream.ts";
import type { PreparedRun } from "../run-stream/run-stream.types.ts";
import type { UserRow } from "../users/users.types.ts";
import type {
	ReplyOptions,
	ToolOutcome,
	WidgetReply,
} from "../widget/widget.types.ts";
import { prepareNewMessage, prepareResume } from "./reply.service.ts";
import type { ReplyDeps } from "./reply.types.ts";

/** Catalogs kept classified at once: sites are few, their catalogs rarely change. */
const CLASSIFIED_CACHE_SIZE = 32;

/** Starts, resumes and prepares GOAP replies. Shared by `/v1/messages` and the widget. */
export class ReplyService implements WidgetReply {
	/** Classified catalogs by `hashTools`, least recently used first. Actions hold no per-thread state. */
	private readonly classified = new Map<string, GoapAction[]>();

	constructor(private readonly deps: ReplyDeps) {}

	/** Starts the GOAP reply for an already-authorized user and internal thread. */
	startReply(
		user: UserRow,
		threadId: string,
		text: string,
		options: ReplyOptions = {},
	): ReadableStream<Uint8Array> {
		return this.openStream(
			user,
			threadId,
			options.signal,
			(planRunId) =>
				prepareNewMessage(this.deps, user, threadId, planRunId, text, options),
			text,
		);
	}

	/** Resumes a run that stopped on a WebMCP tool call, once the browser has run the tool. */
	resumeReply(
		user: UserRow,
		threadId: string,
		toolResult: ToolOutcome,
		signal?: AbortSignal,
	): ReadableStream<Uint8Array> {
		return this.openStream(user, threadId, signal, (planRunId) =>
			prepareResume(this.deps, threadId, planRunId, toolResult),
		);
	}

	/**
	 * Classifies a widget-supplied WebMCP tool list once (through the decision
	 * model) and caches it for the thread's later messages, together with the
	 * step that reads "what to buy" out of the message. Preconditions no action
	 * can satisfy (a site with one store has no "choose a store") are dropped.
	 * An empty list clears the thread's entry, so nothing stale is left behind.
	 */
	async registerWebMcpTools(
		threadId: string,
		tools: WebMcpToolDescriptor[],
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
		const hash = hashTools(tools);
		const cached = this.classified.get(hash);
		if (cached) {
			this.classified.delete(hash);
			this.classified.set(hash, cached); // most recently used last
			webmcpCatalog.set(threadId, cached);
			return;
		}
		const toolActions = await createWebMcpActions({
			tools,
			decisionAgent,
			functionCallAgent,
			onError: this.deps.onError,
		});
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
		user: UserRow,
		threadId: string,
		signal: AbortSignal | undefined,
		prepare: (planRunId: string) => Promise<PreparedRun>,
		prompt?: string,
	): ReadableStream<Uint8Array> {
		const { deps } = this;
		const planRunId = crypto.randomUUID();
		startPlanRun(deps.db, {
			id: planRunId,
			userId: user.id,
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
			prepare: () => prepare(planRunId),
		});
	}
}
