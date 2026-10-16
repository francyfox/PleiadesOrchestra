<script lang="ts">
	import "#lib/pleiades-site.css";
	import { onMount } from "svelte";
	import PlaygroundDemoPanel from "#lib/components/playground/PlaygroundDemoPanel.svelte";
	import PlaygroundGraphPanel from "#lib/components/playground/PlaygroundGraphPanel.svelte";
	import PlaygroundPleiadesPanel from "#lib/components/playground/PlaygroundPleiadesPanel.svelte";
	import PlaygroundToolsPanel from "#lib/components/playground/PlaygroundToolsPanel.svelte";
	import type {
		GraphEdge,
		GraphNode,
		McpTool,
	} from "#lib/components/playground/types.js";
	import { demoChannel, demos } from "#lib/playground/demos.js";

	let selectedUrl = $state(demos[0].url);
	let demo = $derived(demos.find((d) => d.url === selectedUrl) ?? demos[0]);
	let channel = $derived(demoChannel(__PUBLIC_ENV__, demo));
	let tools = $state<McpTool[]>([]);
	// The demo iframe as of its last load. watchDemoFrame is set by the async onMount IIFE
	// once document.modelContext is ready and re-subscribes to the frame on every load.
	let demoFrame: HTMLIFrameElement | null = null;
	let watchDemoFrame: (() => void) | null = null;
	let nodes = $state<GraphNode[]>([]);
	let edges = $state<GraphEdge[]>([]);

	function resetGraph() {
		nodes = [];
		edges = [];
	}

	// WebMCP event wiring
	onMount(() => {
		// Listeners registered by the async setup below; held here so the
		// synchronous cleanup can remove them even if setup is still in flight.
		let mcCleanup: (() => void) | null = null;

		// The widget installs document.modelContext inside a queueMicrotask
		// in its #mount(). Await the import + one extra microtask so the
		// polyfill is in place before we read document.modelContext.
		void (async () => {
			await import("@shalotts/pleiades-widget");
			await Promise.resolve();

			const mc = (document as any).modelContext;
			if (!mc) return;

			async function refreshTools() {
				try {
					tools = await mc.getTools();
				} catch {
					/* not ready */
				}
			}
			function handleToolChange() {
				void refreshTools();
			}
			function handleToolActivated(e: Event) {
				const name: string = (e as any).toolName ?? "tool";
				const id = `n-${Date.now()}-${Math.random().toString(36).slice(2)}`;
				const prev = nodes.length > 0 ? nodes[nodes.length - 1] : null;
				nodes = [
					...nodes.map((nd) => ({ ...nd, active: false })),
					{ id, label: name, x: 0, y: 0, active: true },
				];
				if (prev) edges = [...edges, { from: prev.id, to: id }];
			}

			// Same-origin demos often register tools after `load` (React effects, async
			// setup), and their polyfill fires toolchange/toolactivated on the demo's own
			// modelContext, not ours. Re-fire toolchange on ours: that refreshes the panel
			// (handleToolChange) and makes the widget re-announce its catalog to the
			// server, which it only does on our document's toolchange — otherwise it keeps
			// the previous demo's tools. Cross-origin frames throw on .document and just
			// get the one announce on load.
			const announceToolChange = () =>
				mc.dispatchEvent(new Event("toolchange"));
			let frameCleanup: (() => void) | null = null;
			watchDemoFrame = () => {
				frameCleanup?.();
				frameCleanup = null;
				announceToolChange();
				let fmc: any;
				try {
					fmc = (demoFrame?.contentWindow?.document as any)?.modelContext;
				} catch {
					/* cross-origin */
				}
				if (!fmc || fmc === mc) return;
				fmc.addEventListener("toolchange", announceToolChange);
				fmc.addEventListener("toolactivated", handleToolActivated);
				frameCleanup = () => {
					fmc.removeEventListener("toolchange", announceToolChange);
					fmc.removeEventListener("toolactivated", handleToolActivated);
				};
			};
			mc.addEventListener("toolchange", handleToolChange);
			mc.addEventListener("toolactivated", handleToolActivated);
			// The frame may have loaded before this setup finished.
			watchDemoFrame();
			mcCleanup = () => {
				frameCleanup?.();
				mc.removeEventListener("toolchange", handleToolChange);
				mc.removeEventListener("toolactivated", handleToolActivated);
			};
		})();

		return () => {
			mcCleanup?.();
		};
	});
</script>

<div class="po-site">
<main id="main-content" class="playground">
	<PlaygroundDemoPanel
		{demos}
		{selectedUrl}
		onUrlChange={(url) => { selectedUrl = url; tools = []; resetGraph(); }}
		onDemoLoad={(frame) => { demoFrame = frame; watchDemoFrame?.(); }}
	/>
	<PlaygroundPleiadesPanel
		agentUrl={__PUBLIC_ENV__.PUBLIC_PLEIADES_AGENT_URL ?? ''}
		publishableKey={channel.key}
		demoId={demo.env}
		ownChannel={channel.own}
	/>
	<PlaygroundToolsPanel {tools} />
	<PlaygroundGraphPanel
		{nodes}
		{edges}
		onReset={resetGraph}
	/>
</main>
</div>

<style>
	.playground {
		display: grid;
		grid-template-areas: 'iframe iframe pleiades' 'tools graph pleiades';
		grid-template-columns: 1fr 1fr 360px;
		grid-template-rows: 2fr 1fr;
		height: calc(100dvh - var(--po-nav) - 2rem);
		gap: 2px;
		background: var(--rule);
	}

	:global(.panel) {
		display: flex;
		flex-direction: column;
		overflow: hidden;
		background: var(--bg);
	}

	:global(.panel-header) {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.375rem 0.75rem;
		border-bottom: 1px solid var(--rule);
		font-size: 0.75rem;
		flex-shrink: 0;
		color: var(--dim);
	}

	:global(.panel-icon) {
		color: var(--dim);
	}

	:global(.panel-subtitle) {
		color: var(--dim);
		opacity: 0.6;
		margin-left: 0.25rem;
	}
</style>
