import type { WebMcpToolDescriptor } from "@repo/core";
import { createWebMcpActions } from "@repo/core";
import { REPLY_GOAL } from "../goap/goap.service.ts";
import { startPlanRun } from "../plan-runs/plan-runs.service.ts";
import { streamPlanRun } from "../run-stream/run-stream.ts";
import type { PreparedRun } from "../run-stream/run-stream.types.ts";
import type { UserRow } from "../users/users.types.ts";
import type { CustomerContext, WidgetReply } from "../widget/widget.types.ts";
import { prepareNewMessage, prepareResume } from "./reply.service.ts";
import type { ReplyDeps } from "./reply.types.ts";

/** Starts, resumes and prepares GOAP replies. Shared by `/v1/messages` and the widget. */
export class ReplyService implements WidgetReply {
	constructor(private readonly deps: ReplyDeps) {}

	/** Starts the GOAP reply for an already-authorized user and internal thread. */
	startReply(
		user: UserRow,
		threadId: string,
		text: string,
		signal?: AbortSignal,
		customerContext?: CustomerContext,
	): ReadableStream<Uint8Array> {
		return this.openStream(user, threadId, signal, (planRunId) =>
			prepareNewMessage(
				this.deps,
				user,
				threadId,
				planRunId,
				text,
				customerContext,
			),
		);
	}

	/** Resumes a run that stopped on a WebMCP tool call, once the browser has run the tool. */
	resumeReply(
		user: UserRow,
		threadId: string,
		toolResult: { tool: string; isError: boolean },
		signal?: AbortSignal,
	): ReadableStream<Uint8Array> {
		return this.openStream(user, threadId, signal, (planRunId) =>
			prepareResume(this.deps, threadId, planRunId, toolResult),
		);
	}

	/**
	 * Classifies a widget-supplied WebMCP tool list once (through the decision
	 * model) and caches it for the thread's later messages. An empty list
	 * clears the thread's entry, so nothing stale is left behind.
	 */
	async registerWebMcpTools(
		threadId: string,
		tools: WebMcpToolDescriptor[],
	): Promise<void> {
		const { webmcpCatalog, decisionAgent } = this.deps;
		if (tools.length === 0) {
			webmcpCatalog.delete(threadId);
			return;
		}
		webmcpCatalog.set(
			threadId,
			await createWebMcpActions({ tools, decisionAgent }),
		);
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
		});
		deps.runs.bind(threadId, planRunId);
		return streamPlanRun(deps, {
			run: { planRunId, threadId },
			signal,
			prepare: () => prepare(planRunId),
		});
	}
}
