import type { CallChoice, RequestNode, RequestView } from "admin-api/types";

/**
 * Pure layout of a `RequestView` for the canvas: prompt → understanding →
 * plan rounds → result. A replan drops to its own row and continues to the
 * right of the previous round, so a request reads left to right, top to
 * bottom. Rendering (xyflow) lives in components.
 */

const COLUMN_WIDTH = 230;
const ROW_HEIGHT = 140;
const OPTION_HEIGHT = 30;
const QUESTION_HEADER = 20;
const QUESTION_GAP = 28;
/** Fans hang below the main flow, shifted right so their edges stay visible. */
const FAN_OFFSET_X = 40;
export const MAX_OPTIONS = 12;
/** Options below this share one "the rest" row, unless chosen. */
export const MIN_SHOWN_PROBABILITY = 0.05;

/** One decision-model question in the graph: its options in one node, one edge in. */
export interface ChoiceNodeData {
	[key: string]: unknown;
	/** The decision node this question belongs to. */
	parentId: string;
	question: string;
	/** Which round of a question asked in several, e.g. "group 1 of 2". */
	round?: string;
	/** Highest probability first: the chosen one and those from `MIN_SHOWN_PROBABILITY`, at most `MAX_OPTIONS`. */
	options: { option: string; probability: number; chosen: boolean }[];
	/** How many options were cut off. */
	more: number;
	/** Their probabilities summed. */
	moreProbability: number;
}

export interface RequestNodeData {
	[key: string]: unknown;
	id: string;
	kind: RequestNode["kind"];
	label: string;
	status: RequestNode["status"];
	round: number;
	durationMs: number | null;
	/** The server is working on it right now (or the browser is) — its time keeps counting. */
	live: boolean;
}

export type GraphNode =
	| {
			id: string;
			type: "request";
			position: { x: number; y: number };
			data: RequestNodeData;
	  }
	| {
			id: string;
			type: "choice";
			position: { x: number; y: number };
			data: ChoiceNodeData;
	  };

export interface RequestGraph {
	nodes: GraphNode[];
	edges: {
		id: string;
		source: string;
		target: string;
		data: { kind: "next" | "replan" | "choice" };
	}[];
}

const isLive = (node: RequestNode) =>
	node.status === "running" || node.status === "browser";

export function viewToGraph(view: RequestView): RequestGraph {
	const actions = view.nodes.filter((node) => node.kind === "action");
	const rounds = [...new Set(actions.map((node) => node.round))].sort(
		(a, b) => a - b,
	);

	// The front of the request is a column each: prompt → [translation] →
	// [intent decision] → understanding; the plan's rounds start right after.
	const frontKinds = ["prompt", "translate", "classify", "understand"] as const;
	const frontColumn = new Map<string, number>();
	for (const kind of frontKinds) {
		if (kind === "prompt" || view.nodes.some((node) => node.kind === kind)) {
			frontColumn.set(kind, frontColumn.size);
		}
	}
	const understandColumn = frontColumn.get("understand") ?? frontColumn.size;
	// Where each round starts: the first right after the understanding, every
	// later one after the end of the round before it.
	const startColumn = new Map<number, number>();
	let column = understandColumn + 1;
	for (const round of rounds) {
		startColumn.set(round, column);
		column += actions.filter((node) => node.round === round).length;
	}
	const row = new Map(rounds.map((round, index) => [round, index]));
	const lastRow = rounds.length > 0 ? rounds.length - 1 : 0;

	const seen = new Map<number, number>();
	const placed: GraphNode[] = view.nodes.map((node) => {
		let x: number;
		let y: number;
		if (node.kind === "prompt") {
			x = 0;
			y = 0;
		} else if (frontColumn.has(node.kind)) {
			x = frontColumn.get(node.kind) as number;
			y = 0;
		} else if (node.kind === "result") {
			x = column;
			y = lastRow;
		} else {
			const index = seen.get(node.round) ?? 0;
			seen.set(node.round, index + 1);
			x = (startColumn.get(node.round) ?? understandColumn + 1) + index;
			y = row.get(node.round) ?? 0;
		}
		return {
			id: node.id,
			type: "request" as const,
			position: { x: x * COLUMN_WIDTH, y: y * ROW_HEIGHT },
			data: {
				id: node.id,
				kind: node.kind,
				label: node.label,
				status: node.status,
				round: node.round,
				durationMs: node.durationMs,
				live: isLive(node),
			},
		};
	});

	const edges: RequestGraph["edges"] = view.edges.map((edge) => ({
		id: `${edge.from}->${edge.to}`,
		source: edge.from,
		target: edge.to,
		data: { kind: edge.kind },
	}));

	// Decision-model choices: one node per question, below every main row.
	const fanTop = (lastRow + 1) * ROW_HEIGHT + QUESTION_GAP;
	for (const node of placed) {
		const source = view.nodes.find((n) => n.id === node.id);
		const questions = (source?.detail.calls ?? []).flatMap(
			(call) => call.choices ?? [],
		);
		let y = fanTop;
		questions.forEach((choice, q) => {
			const options = sortedOptions(choice);
			const shown = options
				.filter(
					([option, probability]) =>
						option === choice.chosen || probability >= MIN_SHOWN_PROBABILITY,
				)
				.slice(0, MAX_OPTIONS);
			const rest = options.filter((entry) => !shown.includes(entry));
			const more = rest.length;
			const id = `${node.id}#choice${q}`;
			placed.push({
				id,
				type: "choice",
				position: { x: node.position.x + FAN_OFFSET_X, y },
				data: {
					parentId: node.id,
					question: choice.question,
					round: choice.round,
					options: shown.map(([option, probability]) => ({
						option,
						probability,
						chosen: option === choice.chosen,
					})),
					more,
					moreProbability: rest.reduce((sum, [, p]) => sum + p, 0),
				},
			});
			edges.push({
				id: `${node.id}->${id}`,
				source: node.id,
				target: id,
				data: { kind: "choice" },
			});
			y +=
				QUESTION_HEADER +
				(shown.length + (more > 0 ? 1 : 0)) * OPTION_HEIGHT +
				QUESTION_GAP;
		});
	}

	return { nodes: placed, edges };
}

/** Options by probability, highest first; ties keep the model's order. */
export function sortedOptions(choice: CallChoice): [string, number][] {
	return Object.entries(choice.options).sort((a, b) => b[1] - a[1]);
}

/**
 * How long a node has taken. A node in progress counts on from the moment the
 * snapshot arrived (`receivedAt`); the server's own clock is never compared
 * with the browser's.
 */
export function elapsedMs(
	snapshotMs: number | null,
	live: boolean,
	receivedAt: number,
	nowMs: number,
): number | null {
	if (snapshotMs === null) return null;
	return live ? snapshotMs + Math.max(0, nowMs - receivedAt) : snapshotMs;
}
