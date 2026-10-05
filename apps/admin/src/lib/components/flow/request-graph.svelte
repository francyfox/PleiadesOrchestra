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
	import type { RequestView } from "$lib/api-types";
	import { viewToGraph } from "$lib/request-graph";
	import RequestNode from "./request-node.svelte";

	/** Read-only canvas of one request's decision graph. Clicking a node selects it. */
	let {
		view,
		selectedId,
		onSelect,
		height = "380px",
	}: {
		view: RequestView;
		selectedId: string | null;
		onSelect: (id: string) => void;
		height?: string;
	} = $props();

	const nodeTypes = { request: RequestNode };

	let nodes = $state.raw<Node[]>([]);
	let edges = $state.raw<Edge[]>([]);

	// When this snapshot arrived: a running node's time counts up from here.
	let receivedAt = $state(Date.now());
	$effect(() => {
		void view;
		receivedAt = Date.now();
	});

	const graph = $derived(viewToGraph(view));

	$effect(() => {
		const liveIds = new Set(
			graph.nodes.filter((node) => node.data.live).map((node) => node.id),
		);
		nodes = graph.nodes.map((node) => ({
			id: node.id,
			type: "request",
			position: node.position,
			data: { ...node.data, receivedAt },
			selected: node.id === selectedId,
			draggable: true,
			connectable: false,
		}));
		edges = graph.edges.map((edge) => ({
			id: edge.id,
			source: edge.source,
			target: edge.target,
			// Flow into the node being worked on, and across a replan.
			animated: edge.data.kind === "replan" || liveIds.has(edge.target),
			style: edge.data.kind === "replan" ? "stroke-dasharray: 6 4;" : undefined,
			markerEnd: { type: MarkerType.ArrowClosed },
		}));
	});
</script>

<div class="rounded-md border" style:height>
	{#key view.request.id}
		<SvelteFlow
			bind:nodes
			bind:edges
			{nodeTypes}
			fitView
			nodesConnectable={false}
			onnodeclick={({ node }) => onSelect(node.id)}
			colorMode={mode.current === "dark" ? "dark" : "light"}
			proOptions={{ hideAttribution: true }}
		>
			<Background />
			<Controls showLock={false} />
		</SvelteFlow>
	{/key}
</div>
