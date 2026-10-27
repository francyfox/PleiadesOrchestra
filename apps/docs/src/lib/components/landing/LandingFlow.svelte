<script lang="ts">
	import type { Edge, MarkerType, Node, NodeTypes } from "@xyflow/svelte";
	import { onMount } from "svelte";
	import { MediaQuery } from "svelte/reactivity";
	import Pane from "#lib/components/Pane.svelte";
	import { localeFromPath } from "#lib/i18n.js";
	import { landingContent } from "#lib/landing/content.js";
	import { page } from "$app/state";

	let t = $derived(landingContent(localeFromPath(page.url.pathname)).flow);

	// Gamma's options on a channel without an intent set (the default): the site's tools by name,
	// plus chat and other (chooseTool in @repo/core). The first one wins.
	const options = [
		{ id: "search_products", p: 0.88 },
		{ id: "search_site", p: 0.06 },
		{ id: "get_product", p: 0.03 },
		{ id: "chat", p: 0.02 },
		{ id: "other", p: 0.01 },
	];
	const chosen = `opt-${options[0].id}`;

	// Wide: two rows, left to right up to gamma's options, then back right to left down to the reply.
	const wide = {
		widget: { x: 0, y: 0, in: "bottom", out: "right" },
		translate: { x: 260, y: 0, in: "left", out: "right" },
		rules: { x: 520, y: 0, in: "left", out: "right" },
		gamma: { x: 780, y: 0, in: "left", out: "right" },
		plan: { x: 1040, y: 300, in: "top", out: "left" },
		delta: { x: 780, y: 300, in: "right", out: "left" },
		tool: { x: 520, y: 300, in: "right", out: "left" },
		beta: { x: 260, y: 300, in: "right", out: "left" },
		options: { x: 1040, y: -110 },
	} as const;
	// Narrow (phones): one column, gamma's options beside it, the reply loops back on the left.
	const narrow = {
		widget: { x: 0, y: 0, in: "left", out: "bottom" },
		translate: { x: 0, y: 120, in: "top", out: "bottom" },
		rules: { x: 0, y: 240, in: "top", out: "bottom" },
		gamma: { x: 0, y: 360, in: "top", out: "right" },
		plan: { x: 0, y: 600, in: "top", out: "bottom" },
		delta: { x: 0, y: 720, in: "top", out: "bottom" },
		tool: { x: 0, y: 840, in: "top", out: "bottom" },
		beta: { x: 0, y: 960, in: "top", out: "left" },
		options: { x: 240, y: 290 },
	} as const;
	type Step = Exclude<keyof typeof wide, "options">;
	const steps = Object.keys(wide).filter((k) => k !== "options") as Step[];

	const phone = new MediaQuery("max-width: 767px");
	let layout = $derived(phone.current ? narrow : wide);

	// The run, one node a tick; the last step is the reply landing back in the widget.
	const order: string[] = [
		"widget",
		"translate",
		"rules",
		"gamma",
		chosen,
		"plan",
		"delta",
		"tool",
		"beta",
		"answer",
	];
	const links: [string, string][] = [
		["widget", "translate"],
		["translate", "rules"],
		["rules", "gamma"],
		...options.map((o): [string, string] => ["gamma", `opt-${o.id}`]),
		[chosen, "plan"],
		["plan", "delta"],
		["delta", "tool"],
		["tool", "beta"],
		["beta", "widget"],
	];

	let step = $state(0);
	// Client only: the canvas measures its nodes in the DOM, so the server never loads xyflow.
	let flow = $state<{
		SvelteFlow: typeof import("@xyflow/svelte").SvelteFlow;
		nodeTypes: NodeTypes;
	}>();

	onMount(() => {
		void Promise.all([
			import("@xyflow/svelte"),
			import("#lib/components/landing/LandingFlowNode.svelte"),
			import("@xyflow/svelte/dist/style.css"),
		]).then(([xy, node]) => {
			flow = { SvelteFlow: xy.SvelteFlow, nodeTypes: { step: node.default } };
		});
		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
			step = order.length;
			return;
		}
		// A few idle ticks on the finished run before it starts again.
		const timer = setInterval(() => {
			step = step >= order.length + 2 ? 0 : step + 1;
		}, 1000);
		return () => clearInterval(timer);
	});

	function statusOf(id: string) {
		if (id === "widget" && step === order.length - 1) return "active";
		const i = order.indexOf(id);
		return i < step ? "done" : i === step ? "active" : "idle";
	}

	let nodes = $state.raw<Node[]>([]);
	let edges = $state.raw<Edge[]>([]);

	$effect(() => {
		const gammaAnswered = step >= order.indexOf(chosen);
		nodes = [
			...steps.map((id) => ({
				id,
				type: "step",
				position: { x: layout[id].x, y: layout[id].y },
				data: {
					...t.nodes[id],
					in: layout[id].in,
					out: layout[id].out,
					status: statusOf(id),
				},
			})),
			...options.map((o, i) => {
				const id = `opt-${o.id}`;
				return {
					id,
					type: "step",
					// The winner sits at the bottom, so its edge down to the plan crosses nothing.
					position: {
						x: layout.options.x,
						y: layout.options.y + (options.length - 1 - i) * 52,
					},
					data: {
						option: true,
						text: o.id,
						tag: o.p.toFixed(2),
						in: "left",
						out: "bottom",
						status:
							id === chosen
								? statusOf(id)
								: gammaAnswered
									? "rejected"
									: "idle",
					},
				};
			}),
		];
		edges = links.map(([source, target]) => {
			const reached =
				target === "widget"
					? step >= order.length - 1
					: order.indexOf(target) <= step;
			const live =
				target === "widget"
					? step === order.length - 1
					: order.indexOf(target) === step;
			return {
				id: `${source}-${target}`,
				source,
				target,
				animated: live,
				style: `stroke: ${reached && (!target.startsWith("opt-") || target === chosen) ? "var(--accent)" : "var(--rule)"}; stroke-width: 2;`,
				markerEnd: { type: "arrowclosed" as MarkerType },
			};
		});
	});
</script>

<Pane title="guest@pleiades — flow" header={false} id="flow" class="lg:col-span-2">
	<h2 class="text-xl font-bold">{t.heading}</h2>
	<p class="mt-2 max-w-3xl text-sm">{t.lead}</p>

	<figure
		class="landing-flow m-0 mt-6 w-full"
		style:height={phone.current ? "58rem" : "28rem"}
		aria-label={t.aria}
	>
		<!-- fitView runs once per canvas: a new one for each layout. -->
		{#if flow}{#key layout}
			<flow.SvelteFlow
				bind:nodes
				bind:edges
				nodeTypes={flow.nodeTypes}
				fitView
				nodesDraggable={false}
				nodesConnectable={false}
				elementsSelectable={false}
				panOnDrag={false}
				zoomOnScroll={false}
				zoomOnPinch={false}
				zoomOnDoubleClick={false}
				preventScrolling={false}
				minZoom={0.2}
				proOptions={{ hideAttribution: true }}
			/>{/key}
		{/if}
	</figure>
	<p class="mt-2 text-xs" style:color="var(--dim)">{t.note}</p>
</Pane>

<style>
	/* The canvas sits on the page's own background; the handles are only anchors for the edges. */
	.landing-flow :global(.svelte-flow) {
		--xy-background-color: transparent;
		--xy-node-border-radius: 0;
	}
	.landing-flow :global(.svelte-flow__handle) {
		opacity: 0;
	}
</style>
