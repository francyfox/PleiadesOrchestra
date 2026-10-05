import type { RequestNode, RequestView } from "admin-api/types";

/**
 * Pure layout of a `RequestView` for the canvas: prompt → understanding →
 * plan rounds → result. A replan drops to its own row and continues to the
 * right of the previous round, so a request reads left to right, top to
 * bottom. Rendering (xyflow) lives in components.
 */

const COLUMN_WIDTH = 230;
const ROW_HEIGHT = 140;

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

export interface RequestGraph {
	nodes: {
		id: string;
		position: { x: number; y: number };
		data: RequestNodeData;
	}[];
	edges: {
		id: string;
		source: string;
		target: string;
		data: { kind: "next" | "replan" };
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
	const placed = view.nodes.map((node) => {
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

	return {
		nodes: placed,
		edges: view.edges.map((edge) => ({
			id: `${edge.from}->${edge.to}`,
			source: edge.from,
			target: edge.to,
			data: { kind: edge.kind },
		})),
	};
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
