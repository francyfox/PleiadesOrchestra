import type { Edge, Node, NodeTypes, SvelteFlow } from "@xyflow/svelte";
import { onMount } from "svelte";
import type { FlowScenario } from "./flow.data.ts";
import { buildEdges, buildNodes, type layoutFlow } from "./flow.service.ts";

/** Roving-focus tabs (a row or a side menu): the arrows move both the selection and the focus. */
export function useTabs<K extends string>(keys: K[], onSelect: () => void) {
	let tab = $state(keys[0]);
	const buttons = $state<HTMLButtonElement[]>([]);

	function select(key: K) {
		tab = key;
		onSelect();
	}

	function onKey(e: KeyboardEvent, i: number) {
		const d = ["ArrowRight", "ArrowDown"].includes(e.key)
			? 1
			: ["ArrowLeft", "ArrowUp"].includes(e.key)
				? -1
				: 0;
		if (!d) return;
		e.preventDefault();
		const next = (i + d + keys.length) % keys.length;
		select(keys[next]);
		buttons[next]?.focus();
	}

	return {
		get tab() {
			return tab;
		},
		buttons,
		select,
		onKey,
	};
}

/** The run, one step a second, a few idle ticks on the finished run; reduced motion shows it whole. */
export function useFlowRun(length: () => number) {
	let step = $state(0);
	let reduced = false;

	onMount(() => {
		reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		if (reduced) {
			step = Number.MAX_SAFE_INTEGER;
			return;
		}
		const timer = setInterval(() => {
			step = step >= length() + 2 ? 0 : step + 1;
		}, 1000);
		return () => clearInterval(timer);
	});

	return {
		get step() {
			return step;
		},
		restart() {
			step = reduced ? Number.MAX_SAFE_INTEGER : 0;
		},
	};
}

/** Client only: the canvas measures its nodes in the DOM, so the server never loads xyflow. */
export function useSvelteFlow() {
	let flow = $state<{ SvelteFlow: typeof SvelteFlow; nodeTypes: NodeTypes }>();

	onMount(() => {
		void Promise.all([
			import("@xyflow/svelte"),
			import("#lib/components/landing/LandingFlowNode.svelte"),
			import("@xyflow/svelte/dist/style.css"),
		]).then(([xy, node]) => {
			flow = { SvelteFlow: xy.SvelteFlow, nodeTypes: { step: node.default } };
		});
	});

	return {
		get current() {
			return flow;
		},
	};
}

/** Nodes and edges for the canvas (bindable: xyflow writes the measured sizes back). */
export function useFlowGraph(
	input: () => {
		scenario: FlowScenario;
		geometry: ReturnType<typeof layoutFlow>;
		texts: Record<string, { tag: string; text: string }>;
		step: number;
		key: string;
	},
) {
	let nodes = $state.raw<Node[]>([]);
	let edges = $state.raw<Edge[]>([]);
	// Changes after the nodes do: a canvas remounted before them would fit an empty graph.
	let key = $state("");

	$effect(() => {
		const i = input();
		nodes = buildNodes(i.scenario, i.geometry, i.texts, i.step);
		edges = buildEdges(i.scenario, i.step);
		key = i.key;
	});

	return {
		get nodes() {
			return nodes;
		},
		set nodes(value) {
			nodes = value;
		},
		get edges() {
			return edges;
		},
		set edges(value) {
			edges = value;
		},
		get key() {
			return key;
		},
	};
}
