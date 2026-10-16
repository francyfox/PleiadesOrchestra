<script lang="ts">
	import type { GraphEdge, GraphNode } from "./types.ts";

	interface Props {
		nodes: GraphNode[];
		edges: GraphEdge[];
		onReset: () => void;
	}

	const { nodes, edges, onReset }: Props = $props();

	// Internal canvas state — NOT a prop
	let canvas = $state<HTMLCanvasElement | null>(null);

	// Pure drawing function — takes all inputs as parameters, never reads or
	// writes $state. This makes it safe to call from both $effect and
	// ResizeObserver without risk of unintended reactive writes.
	function drawGraphImpl(
		el: HTMLCanvasElement,
		currentNodes: GraphNode[],
		currentEdges: GraphEdge[],
	) {
		const ctx = el.getContext("2d");
		if (!ctx) return;
		const { width: w, height: h } = el;
		if (w === 0 || h === 0) return;

		const style = getComputedStyle(document.documentElement);
		const ruleColor = style.getPropertyValue("--rule").trim();
		const fgColor = style.getPropertyValue("--fg").trim();
		const accentColor = style.getPropertyValue("--accent").trim();
		const accent2Color = style.getPropertyValue("--accent-2").trim();
		const dangerColor = style.getPropertyValue("--danger").trim();
		const bgColor = style.getPropertyValue("--bg").trim();

		ctx.clearRect(0, 0, w, h);
		ctx.fillStyle = bgColor;
		ctx.fillRect(0, 0, w, h);

		if (currentNodes.length === 0) return;

		const R = 28;
		const padding = 56;
		const n = currentNodes.length;
		const stepX = n > 1 ? (w - 2 * padding) / (n - 1) : 0;
		const cy = h / 2;

		const pos = currentNodes.map((node, i) => ({
			...node,
			px: n === 1 ? w / 2 : padding + i * stepX,
			py: cy,
		}));

		// draw edges
		for (const edge of currentEdges) {
			const src = pos.find((p) => p.id === edge.from);
			const dst = pos.find((p) => p.id === edge.to);
			if (!src || !dst) continue;

			const angle = Math.atan2(dst.py - src.py, dst.px - src.px);
			const x1 = src.px + R * Math.cos(angle);
			const y1 = src.py + R * Math.sin(angle);
			const x2 = dst.px - R * Math.cos(angle);
			const y2 = dst.py - R * Math.sin(angle);

			ctx.beginPath();
			ctx.moveTo(x1, y1);
			ctx.lineTo(x2, y2);
			ctx.strokeStyle = ruleColor;
			ctx.lineWidth = 1.5;
			ctx.stroke();

			const headLen = 8;
			ctx.beginPath();
			ctx.moveTo(x2, y2);
			ctx.lineTo(
				x2 - headLen * Math.cos(angle - 0.4),
				y2 - headLen * Math.sin(angle - 0.4),
			);
			ctx.lineTo(
				x2 - headLen * Math.cos(angle + 0.4),
				y2 - headLen * Math.sin(angle + 0.4),
			);
			ctx.closePath();
			ctx.fillStyle = ruleColor;
			ctx.fill();
		}

		// draw nodes
		for (const node of pos) {
			ctx.beginPath();
			ctx.arc(node.px, node.py, R, 0, Math.PI * 2);
			ctx.fillStyle = bgColor;
			ctx.fill();

			let strokeColor: string;
			let textColor: string;
			if (node.nodeStatus === "error") {
				strokeColor = dangerColor || "#ef4444";
				textColor = dangerColor || "#ef4444";
			} else if (node.nodeStatus === "running" || node.active) {
				strokeColor = accentColor;
				textColor = accentColor;
			} else if (node.nodeStatus === "done") {
				strokeColor = accent2Color || accentColor;
				textColor = fgColor;
			} else {
				strokeColor = node.active ? accentColor : ruleColor;
				textColor = node.active ? accentColor : fgColor;
			}

			ctx.strokeStyle = strokeColor;
			ctx.lineWidth = node.active ? 2.5 : 1.5;
			ctx.stroke();

			const label =
				node.label.length > 10 ? node.label.slice(0, 9) + "…" : node.label;
			ctx.fillStyle = textColor;
			ctx.font = "10px monospace";
			ctx.textAlign = "center";
			ctx.textBaseline = "middle";
			ctx.fillText(label, node.px, node.py);
		}
	}

	// Reactive redraws: reads nodes/edges/canvas into locals then calls the
	// pure drawGraphImpl — no $state is written anywhere in this effect.
	$effect(() => {
		const currentNodes = nodes;
		const currentEdges = edges;
		const currentCanvas = canvas;
		if (currentCanvas) {
			drawGraphImpl(currentCanvas, currentNodes, currentEdges);
		}
	});

	// Attachment: wires up canvas sizing + ResizeObserver and keeps the canvas
	// $state reference in sync with the element lifecycle.
	function canvasAttachment(el: HTMLCanvasElement) {
		canvas = el;

		const wrapper = el.parentElement;
		if (!wrapper) {
			return () => {
				canvas = null;
			};
		}

		function resizeCanvas() {
			el.width = wrapper!.clientWidth;
			el.height = wrapper!.clientHeight;
			// Read current reactive state values at call time (outside reactive
			// context, so no tracking — that is intentional here).
			drawGraphImpl(el, nodes, edges);
		}

		const ro = new ResizeObserver(resizeCanvas);
		ro.observe(wrapper);
		resizeCanvas();

		return () => {
			ro.disconnect();
			canvas = null;
		};
	}
</script>

<div class="panel graph-panel">
	<div class="panel-header">
		<span aria-hidden="true" class="panel-icon">○</span>
		Resolution Graph
		{#if nodes.length > 0}
			<button type="button" class="reset-btn" onclick={onReset}>reset</button>
		{/if}
	</div>
	<div class="canvas-wrap">
		{#if nodes.length === 0}
			<div class="canvas-empty">Tool calls will appear here</div>
		{/if}
		<canvas {@attach canvasAttachment}></canvas>
	</div>
</div>

<style>
	.graph-panel {
		grid-area: graph;
	}

	.canvas-wrap {
		flex: 1;
		position: relative;
		overflow: hidden;
	}

	canvas {
		position: absolute;
		inset: 0;
	}

	.canvas-empty {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.75rem;
		color: var(--dim);
		pointer-events: none;
		z-index: 1;
	}

	.reset-btn {
		margin-left: auto;
		font-size: 0.65rem;
		padding: 0.1rem 0.4rem;
		border: 1px solid var(--rule);
		border-radius: 3px;
		background: transparent;
		color: var(--dim);
		cursor: pointer;
		font-family: inherit;
		flex-shrink: 0;
	}

	.reset-btn:hover {
		border-color: var(--accent);
		color: var(--fg);
	}
</style>
