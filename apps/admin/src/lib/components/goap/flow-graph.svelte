<script lang="ts">
	import "@xyflow/svelte/dist/style.css";
	import {
		Background,
		Controls,
		type Edge,
		MarkerType,
		type Node,
		SvelteFlow,
	} from "@xyflow/svelte";
	import { mode } from "mode-watcher";
	import type { GraphEdge, GraphNode } from "$lib/goap-graph";
	import FlowNode from "./flow-node.svelte";

	/** Read-only xyflow canvas for graphs produced by `$lib/goap-graph`. */
	let {
		graph,
		details,
		height = "420px",
	}: {
		graph: { nodes: GraphNode<Record<string, unknown>>[]; edges: GraphEdge[] };
		/** Extra text lines shown under each node's label. */
		details?: (data: Record<string, unknown>) => string[];
		height?: string;
	} = $props();

	const nodeTypes = { goap: FlowNode };

	let nodes = $state.raw<Node[]>([]);
	let edges = $state.raw<Edge[]>([]);

	$effect(() => {
		nodes = graph.nodes.map((node) => ({
			id: node.id,
			type: "goap",
			position: node.position,
			data: { ...node.data, details: details?.(node.data) ?? [] },
			draggable: true,
			connectable: false,
		}));
		edges = graph.edges.map((edge) => ({
			id: edge.id,
			source: edge.source,
			target: edge.target,
			animated: edge.data.kind === "replan",
			label: edge.data.kind === "replan" ? "replan" : undefined,
			style: edge.data.kind === "replan" ? "stroke-dasharray: 6 4;" : undefined,
			markerEnd: { type: MarkerType.ArrowClosed },
		}));
	});
</script>

<div class="rounded-md border" style:height>
	<SvelteFlow
		bind:nodes
		bind:edges
		{nodeTypes}
		fitView
		nodesConnectable={false}
		colorMode={mode.current === "dark" ? "dark" : "light"}
		proOptions={{ hideAttribution: true }}
	>
		<Background />
		<Controls showLock={false} />
	</SvelteFlow>
</div>
