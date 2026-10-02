import type {
	NodeCall,
	NodeDetail,
	NodeStatus,
	RequestEdge,
	RequestNode,
	RequestView,
	UpstreamRequestDetails,
} from "./requests.schema.ts";

type Upstream = UpstreamRequestDetails;
type Facts = Record<string, unknown>;

const record = (value: unknown): Facts =>
	value && typeof value === "object" && !Array.isArray(value)
		? (value as Facts)
		: {};

const facts = (value: unknown) => record(value) as NodeDetail["effects"];

const emptyDetail = (): NodeDetail => ({
	text: null,
	intent: null,
	goal: null,
	tool: null,
	toolArgs: null,
	browserMs: null,
	expected: null,
	effects: null,
	error: null,
	calls: [],
});

/** One action as the run went through it, possibly across several runs (a browser tool pauses the run). */
interface Step {
	node: RequestNode;
	runIds: Set<string>;
	waitingAt: number | null;
	finishedAt: number | null;
}

/** The planned facts an action promised but did not deliver. */
function diverged(expected: Facts, observed: Facts): boolean {
	return Object.entries(expected).some(
		([key, value]) => observed[key] !== value,
	);
}

/**
 * Turns what the orchestrator stored for one request (its runs, their trace
 * events, the model calls) into what the panel draws: a prompt, how it was
 * understood, every plan step with the time it took and what it got, and the
 * result. A browser tool is a single step even though the server run stops and
 * resumes around it. The panel only renders this — nothing is decided there.
 */
export function buildRequestView(upstream: Upstream): RequestView {
	const { request, runs, llmCalls, now } = upstream;
	const live = request.status === "running" || request.status === "waiting";

	const firstPlanned = runs
		.flatMap((run) => run.events)
		.find((event) => event.type === "planned");

	const nodes: RequestNode[] = [];
	nodes.push({
		id: "prompt",
		kind: "prompt",
		label: request.prompt ?? "",
		round: 0,
		status: "done",
		startedAt: request.startedAt,
		durationMs: null,
		detail: { ...emptyDetail(), text: request.prompt },
	});
	nodes.push({
		id: "understand",
		kind: "understand",
		label: request.intent ?? "",
		round: 0,
		status: firstPlanned ? "done" : live ? "running" : "failed",
		startedAt: request.startedAt,
		durationMs: firstPlanned
			? firstPlanned.at - request.startedAt
			: live
				? Math.max(0, now - request.startedAt)
				: null,
		detail: { ...emptyDetail(), intent: request.intent, goal: request.goal },
	});

	// --- plan steps ---------------------------------------------------------
	const steps = new Map<string, Step>();
	const order: Step[] = [];
	let round = 1;
	let lastPlan: { round: number; names: string[] } | undefined;

	const keyOf = (action: string) => `${round}:${action}`;
	const addStep = (key: string, node: RequestNode, runId: string): Step => {
		const step: Step = {
			node,
			runIds: new Set([runId]),
			waitingAt: null,
			finishedAt: null,
		};
		steps.set(key, step);
		order.push(step);
		return step;
	};

	for (const [index, run] of runs.entries()) {
		// The first plan of a resumed run carries the browser's answers.
		let resumeState: Facts | undefined;
		let sawPlan = false;
		for (const event of run.events) {
			const action = event.action ?? "";
			const payload = event.payload;
			switch (event.type) {
				case "planned": {
					const plan = Array.isArray(payload.plan) ? payload.plan : [];
					lastPlan = {
						round,
						names: plan.map((step) => String(record(step).name)),
					};
					if (!sawPlan && index > 0) resumeState = record(payload.state);
					sawPlan = true;
					break;
				}
				case "no_plan": {
					const key = `${round}:no_plan`;
					addStep(
						key,
						{
							id: key,
							kind: "action",
							label: "no_plan",
							round,
							status: "failed",
							startedAt: event.at,
							durationMs: 0,
							detail: emptyDetail(),
						},
						run.id,
					);
					break;
				}
				case "action_started": {
					const key = keyOf(action);
					const existing = steps.get(key);
					if (existing) {
						// A browser tool coming back: same step, new run.
						existing.runIds.add(run.id);
						if (existing.waitingAt !== null) {
							existing.node.detail.browserMs = Math.max(
								0,
								run.createdAt - existing.waitingAt,
							);
						}
						existing.node.status = "running";
						break;
					}
					addStep(
						key,
						{
							id: key,
							kind: "action",
							label: action,
							round,
							status: "running",
							startedAt: event.at,
							durationMs: null,
							detail: emptyDetail(),
						},
						run.id,
					);
					break;
				}
				case "waiting": {
					const step = steps.get(keyOf(action));
					if (!step) break;
					const call = record(record(payload.waiting).payload);
					step.waitingAt = event.at;
					step.node.status = "browser";
					step.node.detail.tool =
						typeof call.tool === "string" ? call.tool : action;
					step.node.detail.toolArgs = record(call.arguments);
					step.node.detail.browserMs = null;
					break;
				}
				case "action_finished": {
					const step = steps.get(keyOf(action));
					if (!step) break;
					const expected = record(payload.expectedEffects);
					const observed = record(payload.observedEffects);
					step.finishedAt = event.at;
					step.node.detail.expected = facts(expected);
					step.node.detail.effects = facts(observed);
					step.node.status =
						observed[`toolResult:${action}`] === false
							? "failed"
							: diverged(expected, observed)
								? "diverged"
								: "done";
					const tool = step.node.detail.tool;
					if (tool && resumeState) {
						const text = resumeState[`webmcp:${tool}:text`];
						if (typeof text === "string") step.node.detail.text = text;
					}
					break;
				}
				case "action_failed": {
					const step = steps.get(keyOf(action));
					if (!step) break;
					step.finishedAt = event.at;
					step.node.status = "failed";
					step.node.detail.error = String(payload.error ?? "");
					break;
				}
				case "action_skipped": {
					const key = `${keyOf(action)}:skipped`;
					const unmet = Object.keys(record(payload.unmetPreconditions));
					addStep(
						key,
						{
							id: key,
							kind: "action",
							label: action,
							round,
							status: "skipped",
							startedAt: event.at,
							durationMs: 0,
							detail: {
								...emptyDetail(),
								error: unmet.length ? `unmet: ${unmet.join(", ")}` : null,
							},
						},
						run.id,
					);
					break;
				}
				case "replan":
					round += 1;
					break;
				case "killed":
					for (const step of order) {
						if (step.node.status === "running") {
							step.node.status = "failed";
							step.node.detail.error = "cancelled";
							step.finishedAt = event.at;
						}
					}
					break;
				default:
					break;
			}
		}
	}

	// Durations and the model calls each step made.
	for (const step of order) {
		const { node } = step;
		const started = node.startedAt;
		if (started !== null && node.kind === "action") {
			if (step.finishedAt !== null) {
				node.durationMs = Math.max(0, step.finishedAt - started);
			} else if (node.status === "running" || node.status === "browser") {
				node.durationMs = Math.max(0, now - started);
			}
		}
		node.detail.calls = llmCalls
			.filter(
				(call) =>
					call.actionName === node.label &&
					call.planRunId !== null &&
					step.runIds.has(call.planRunId),
			)
			.map(
				(call): NodeCall => ({
					provider: call.provider,
					model: call.model,
					latencyMs: call.latencyMs,
					inputTokens: call.inputTokens,
					outputTokens: call.outputTokens,
					ok: call.ok,
					error: call.error,
				}),
			);
	}

	// Steps the latest plan still has ahead of it.
	const rounds = new Map<number, RequestNode[]>();
	for (const step of order) {
		const list = rounds.get(step.node.round) ?? [];
		list.push(step.node);
		rounds.set(step.node.round, list);
	}
	if (lastPlan) {
		const pendingStatus: NodeStatus = live ? "pending" : "not_reached";
		const list = rounds.get(lastPlan.round) ?? [];
		for (const name of lastPlan.names) {
			const key = `${lastPlan.round}:${name}`;
			if (steps.has(key) || steps.has(`${key}:skipped`)) continue;
			list.push({
				id: key,
				kind: "action",
				label: name,
				round: lastPlan.round,
				status: pendingStatus,
				startedAt: null,
				durationMs: null,
				detail: emptyDetail(),
			});
		}
		rounds.set(lastPlan.round, list);
	}

	const roundNumbers = [...rounds.keys()].sort((a, b) => a - b);
	for (const number of roundNumbers) nodes.push(...(rounds.get(number) ?? []));

	nodes.push({
		id: "result",
		kind: "result",
		label: request.reply ?? "",
		round: 0,
		status: live
			? "pending"
			: request.status === "succeeded"
				? "reached"
				: "missed",
		startedAt: null,
		durationMs: request.durationMs,
		detail: { ...emptyDetail(), text: request.reply },
	});

	// --- edges: a chain inside each round, replan edges between rounds -------
	const edges: RequestEdge[] = [
		{ from: "prompt", to: "understand", kind: "next" },
	];
	const previous = "understand";
	let previousRound: number | undefined;
	let tail = "understand";
	for (const number of roundNumbers) {
		const list = rounds.get(number) ?? [];
		for (const [i, node] of list.entries()) {
			if (i === 0) {
				edges.push({
					from: previousRound === undefined ? previous : tail,
					to: node.id,
					kind: previousRound === undefined ? "next" : "replan",
				});
			} else {
				edges.push({
					from: (list[i - 1] as RequestNode).id,
					to: node.id,
					kind: "next",
				});
			}
		}
		const last = list.at(-1);
		if (last) {
			tail = last.id;
			previousRound = number;
		}
	}
	edges.push({ from: tail, to: "result", kind: "next" });

	// A finished request must serialize identically on every read, or the live
	// hub would push it again and again: only a request in progress carries the clock.
	return {
		request,
		nodes,
		edges,
		now: live ? now : request.startedAt + request.durationMs,
	};
}
