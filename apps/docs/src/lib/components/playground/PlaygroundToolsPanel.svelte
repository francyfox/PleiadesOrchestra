<script lang="ts">
	import type { McpTool } from "./types.ts";

	interface Props {
		tools: McpTool[];
	}

	const { tools }: Props = $props();
</script>

<div class="panel tools-panel">
	<div class="panel-header">
		<span aria-hidden="true" class="panel-icon">○</span>
		MCP Tools
		<span class="tools-badge">{tools.length}</span>
	</div>
	<div class="panel-scroll">
		{#if tools.length === 0}
			<div class="empty-state">No tools registered yet. Open a demo above.</div>
		{:else}
			{#each tools as tool (tool.name)}
				<details class="tool-item">
					<summary class="tool-summary">
						<span class="tool-name">{tool.name}</span>
						<span class="chip {tool.annotations?.readOnlyHint === true ? 'chip-r' : 'chip-rw'}">
							{tool.annotations?.readOnlyHint === true ? 'r' : 'r/w'}
						</span>
					</summary>
					<p class="tool-desc">{tool.description}</p>
				</details>
			{/each}
		{/if}
	</div>
</div>

<style>
	.tools-panel {
		grid-area: tools;
	}

	.tools-badge {
		margin-left: auto;
		padding: 0.05rem 0.4rem;
		border: 1px solid var(--rule);
		border-radius: 9999px;
		font-size: 0.65rem;
		color: var(--dim);
		flex-shrink: 0;
	}

	.panel-scroll {
		flex: 1;
		overflow-y: auto;
	}

	.empty-state {
		padding: 1rem 0.75rem;
		font-size: 0.75rem;
		color: var(--dim);
	}

	.tool-item {
		border-bottom: 1px solid var(--rule);
	}

	.tool-summary {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.375rem 0.75rem;
		font-size: 0.75rem;
		cursor: pointer;
		list-style: none;
		color: var(--fg);
		user-select: none;
	}

	.tool-summary::-webkit-details-marker {
		display: none;
	}

	.tool-name {
		font-family: var(--font-mono);
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 0.7rem;
	}

	.chip {
		padding: 0.1rem 0.35rem;
		border-radius: 3px;
		font-size: 0.6rem;
		flex-shrink: 0;
		font-family: var(--font-mono);
		letter-spacing: 0.02em;
	}

	/* r chip: blue-ish via --accent-2 (teal), auto-adapts to light/dark theme */
	.chip-r {
		background: color-mix(in srgb, var(--accent-2) 12%, transparent);
		color: var(--accent-2);
	}

	/* r/w chip: amber-ish via --accent, auto-adapts to light/dark theme */
	.chip-rw {
		background: color-mix(in srgb, var(--accent) 12%, transparent);
		color: var(--accent);
	}

	.tool-desc {
		padding: 0.25rem 0.75rem 0.5rem 0.75rem;
		font-size: 0.7rem;
		color: var(--dim);
		margin: 0;
		line-height: 1.4;
	}
</style>
