<script lang="ts">
	import { MediaQuery } from "svelte/reactivity";
	import Pane from "#lib/components/Pane.svelte";
	import { localeFromPath } from "#lib/i18n.js";
	import { landingContent } from "#lib/landing/content.js";
	import {
		FLOW_CASE_KEYS,
		FLOW_CASES,
		FLOW_KEYS,
	} from "#lib/landing/flow.data.js";
	import { layoutFlow, legendOf, runOrder } from "#lib/landing/flow.service.js";
	import {
		useFlowGraph,
		useFlowRun,
		useSvelteFlow,
		useTabs,
	} from "#lib/landing/flow.svelte.js";
	import { page } from "$app/state";

	const t = $derived(landingContent(localeFromPath(page.url.pathname)).flow);
	const phone = new MediaQuery("max-width: 767px");
	const run = useFlowRun(() => runOrder(scenario).length);
	const cases = useTabs(FLOW_CASE_KEYS, run.restart);
	const tabs = useTabs(FLOW_KEYS, run.restart);
	const scenario = $derived(FLOW_CASES[cases.tab][tabs.tab]);
	const legend = $derived(legendOf(scenario));
	const geometry = $derived(
		layoutFlow(
			scenario.steps.map((s) => s.id),
			phone.current,
			scenario.fan?.at,
		),
	);
	const flow = useSvelteFlow();
	const graph = useFlowGraph(() => ({
		scenario,
		geometry,
		texts: t.cases[cases.tab][tabs.tab],
		step: run.step,
		key: `${cases.tab}-${tabs.tab}-${phone.current}`,
	}));
</script>

<Pane title="guest@pleiades — flow" header={false} id="flow" class="!border-0 min-h-screen py-10">
	<div class="flex flex-col gap-5">
		<div class="text-3xl font-bold">{t.heading}</div>
		<p class="mt-2 max-w-3xl text-sm">{t.lead}</p>

		<div
				class="p-3 grid gap-4 "
				style:margin-top="1rem"
				style:grid-template-columns={phone.current ? "1fr" : "12rem 1fr"}
		>
			<div
					role="tablist"
					aria-label={t.casesLabel}
					aria-orientation={phone.current ? "horizontal" : "vertical"}
					class="flex flex-wrap content-start gap-2"
			>
				{#each FLOW_CASE_KEYS as key, i (key)}
					<button
							type="button"
							role="tab"
							id="flow-case-{key}"
							aria-selected={cases.tab === key}
							aria-controls="flow-panel"
							tabindex={cases.tab === key ? 0 : -1}
							class="chip cursor-pointer border px-3 py-2 text-left text-sm"
							class:w-full={!phone.current}
							style:color={cases.tab === key ? "var(--fg)" : undefined}
							style:border-color={cases.tab === key ? "var(--accent)" : undefined}
							style:box-shadow={cases.tab === key ? "var(--shadow-xs)" : undefined}
							bind:this={cases.buttons[i]}
							onclick={() => cases.select(key)}
							onkeydown={(e) => cases.onKey(e, i)}
					>
						{t.cases[key].label}
					</button>
				{/each}
			</div>

			<div class="min-w-0">
				<div role="tablist" aria-label={t.tabsLabel} class="flex flex-wrap gap-2">
					{#each FLOW_KEYS as key, i (key)}
						<button
								type="button"
								role="tab"
								id="flow-tab-{key}"
								aria-selected={tabs.tab === key}
								aria-controls="flow-panel"
								tabindex={tabs.tab === key ? 0 : -1}
								class="chip cursor-pointer border px-3 py-1 text-xs"
								style:color={tabs.tab === key ? "var(--fg)" : undefined}
								style:border-color={tabs.tab === key ? "var(--accent)" : undefined}
								bind:this={tabs.buttons[i]}
								onclick={() => tabs.select(key)}
								onkeydown={(e) => tabs.onKey(e, i)}
						>
							{t.tabs[key]}
						</button>
					{/each}
				</div>

				<div id="flow-panel" role="tabpanel" aria-labelledby="flow-case-{cases.tab} flow-tab-{tabs.tab}">
					<figure
							class="landing-flow m-0 w-full"
							style:margin-top="1rem"
							style:height="{geometry.height}rem"
							aria-label={t.aria}
					>
						<!-- fitView runs once per canvas: a new one for each layout and scenario. -->
						{#if flow.current}{#key graph.key}
							<flow.current.SvelteFlow
									bind:nodes={graph.nodes}
									bind:edges={graph.edges}
									nodeTypes={flow.current.nodeTypes}
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

					<!-- The legend: the whole run, where a chart keeps its key. -->
					<p
							class="flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-3 text-sm tabular-nums"
							style:border-color="var(--rule)"
					>
						<strong style:color={scenario.done ? "var(--accent)" : "var(--danger)"}>
							{scenario.done ? `✓ ${t.legend.done}` : `✗ ${t.legend.failed}`}
						</strong>
						<span>{t.legend.total} <strong>{legend.time}</strong></span>
						<strong>{legend.cost}</strong>
						<span style:color="var(--dim)">{t.legend.calls}: {legend.calls}</span>
					</p>
				</div>
			</div>
		</div>
		<p class="text-xs" style:margin-top="0.75rem" style:color="var(--dim)">{t.note}</p>
	</div>
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
