<script lang="ts">
	import type { Edge, MarkerType, Node, NodeTypes } from "@xyflow/svelte";
	import { onMount } from "svelte";
	import { MediaQuery } from "svelte/reactivity";
	import { layoutFlow } from "#lib/components/landing/flow-layout.js";
	import Pane from "#lib/components/Pane.svelte";
	import { localeFromPath } from "#lib/i18n.js";
	import { landingContent } from "#lib/landing/content.js";
	import { page } from "$app/state";

	let t = $derived(landingContent(localeFromPath(page.url.pathname)).flow);

	type Key = keyof typeof t.scenarios;
	// Structure of each scenario: step ids in run order (texts come from content.ts per step id), and
	// which step has gamma's options fan. The first option wins. Probabilities are illustrative.
	const scenarios: Record<
		Key,
		{
			ids: string[];
			fan?: { at: string; options: { id: string; p: number }[] };
		}
	> = {
		a: {
			ids: [
				"widget",
				"understand",
				"rules",
				"gamma",
				"plan",
				"delta",
				"beta",
				"answer",
			],
			fan: {
				at: "gamma",
				options: [
					{ id: "search_products", p: 0.88 },
					{ id: "get_product", p: 0.05 },
					{ id: "chat", p: 0.04 },
					{ id: "other", p: 0.03 },
				],
			},
		},
		b: {
			ids: [
				"widget",
				"understand",
				"queue",
				"plan1",
				"delta1",
				"plan2",
				"delta2",
				"beta",
				"answer",
			],
		},
		c: {
			ids: [
				"widget",
				"understand",
				"rules",
				"gamma",
				"plan",
				"delta1",
				"delta2",
				"template",
				"answer",
			],
			fan: {
				at: "gamma",
				options: [
					{ id: "addToCart", p: 0.91 },
					{ id: "search", p: 0.05 },
					{ id: "checkout", p: 0.02 },
					{ id: "chat", p: 0.02 },
				],
			},
		},
	};
	const keys = Object.keys(scenarios) as Key[];

	let tab = $state<Key>("a");
	let tabButtons = $state<HTMLButtonElement[]>([]);
	const scenario = $derived(scenarios[tab]);
	const phone = new MediaQuery("max-width: 767px");
	const geometry = $derived(
		layoutFlow(scenario.ids, phone.current, scenario.fan?.at),
	);
	const optionId = (id: string) => `opt-${id}`;
	const chosen = $derived(scenario.fan && optionId(scenario.fan.options[0].id));

	// The run, one node a tick; the chosen option comes right after its fan owner.
	const order = $derived(
		scenario.ids.flatMap((id) =>
			id === scenario.fan?.at && chosen ? [id, chosen] : [id],
		),
	);

	let step = $state(0);
	let reduced = false;
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
		reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		if (reduced) {
			step = order.length;
			return;
		}
		// A few idle ticks on the finished run before it starts again.
		const timer = setInterval(() => {
			step = step >= order.length + 2 ? 0 : step + 1;
		}, 1000);
		return () => clearInterval(timer);
	});

	function select(key: Key) {
		tab = key;
		// Reduced motion shows the whole run; otherwise the new scenario starts over.
		step = reduced ? Number.MAX_SAFE_INTEGER : 0;
	}

	function onKey(e: KeyboardEvent, i: number) {
		const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
		if (!d) return;
		e.preventDefault();
		const next = (i + d + keys.length) % keys.length;
		select(keys[next]);
		tabButtons[next]?.focus();
	}

	function statusOf(id: string) {
		const i = order.indexOf(id);
		return i < step ? "done" : i === step ? "active" : "idle";
	}

	let nodes = $state.raw<Node[]>([]);
	let edges = $state.raw<Edge[]>([]);
	// Changes after the nodes do: a canvas remounted before them would fit an empty graph.
	let canvasKey = $state("");

	$effect(() => {
		const { slots, fan } = geometry;
		const texts: Record<string, { tag: string; text: string }> =
			t.scenarios[tab].steps;
		const gammaAnswered = chosen ? step >= order.indexOf(chosen) : false;
		const options = scenario.fan?.options ?? [];
		nodes = [
			...scenario.ids.map((id) => ({
				id,
				type: "step",
				position: { x: slots[id].x, y: slots[id].y },
				data: {
					...texts[id],
					in: slots[id].in,
					out: slots[id].out,
					status: statusOf(id),
				},
			})),
			...options.map((o, i) => {
				const id = optionId(o.id);
				return {
					id,
					type: "step",
					// The winner sits at the bottom, so its edge down to the next step crosses nothing.
					position: {
						x: fan?.x ?? 0,
						y: (fan?.y ?? 0) + (options.length - 1 - i) * 52,
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
		const links: [string, string][] = order
			.slice(1)
			.map((id, i) => [order[i], id]);
		for (const o of options)
			if (optionId(o.id) !== chosen)
				links.push([scenario.fan?.at ?? "", optionId(o.id)]);
		edges = links.map(([source, target]) => ({
			id: `${source}-${target}`,
			source,
			target,
			animated: order.indexOf(target) === step,
			style: `stroke: ${order.indexOf(target) !== -1 && order.indexOf(target) <= step ? "var(--accent)" : "var(--rule)"}; stroke-width: 2;`,
			markerEnd: { type: "arrowclosed" as MarkerType },
		}));
		canvasKey = `${tab}-${phone.current}`;
	});
</script>

<Pane title="guest@pleiades — flow" header={false} id="flow" class="lg:col-span-2">
	<h2 class="text-xl font-bold">{t.heading}</h2>
	<p class="mt-2 max-w-3xl text-sm">{t.lead}</p>

	<div role="tablist" aria-label={t.tabsLabel} class="mt-4 flex flex-wrap gap-2">
		{#each keys as key, i (key)}
			<button
				type="button"
				role="tab"
				id="flow-tab-{key}"
				aria-selected={tab === key}
				aria-controls="flow-panel"
				tabindex={tab === key ? 0 : -1}
				class="chip cursor-pointer border px-3 py-1 text-xs"
				style:color={tab === key ? "var(--fg)" : undefined}
				style:border-color={tab === key ? "var(--accent)" : undefined}
				bind:this={tabButtons[i]}
				onclick={() => select(key)}
				onkeydown={(e) => onKey(e, i)}
			>
				{t.scenarios[key].label}
			</button>
		{/each}
	</div>

	<div id="flow-panel" role="tabpanel" aria-labelledby="flow-tab-{tab}">
	<figure
		class="landing-flow m-0 mt-4 w-full"
		style:height="{geometry.height}rem"
		aria-label={t.aria}
	>
		<!-- fitView runs once per canvas: a new one for each layout and scenario. -->
		{#if flow}{#key canvasKey}
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
				minZoom={0.1}
				proOptions={{ hideAttribution: true }}
			/>{/key}
		{/if}
	</figure>
	</div>
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
