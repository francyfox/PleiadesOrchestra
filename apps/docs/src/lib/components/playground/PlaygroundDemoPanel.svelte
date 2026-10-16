<script lang="ts">
	interface Props {
		demos: { label: string; url: string }[];
		selectedUrl: string;
		onUrlChange: (url: string) => void;
		onDemoLoad?: (frame: HTMLIFrameElement) => void;
	}

	const { demos, selectedUrl, onUrlChange, onDemoLoad }: Props = $props();
</script>

<div class="panel panel-iframe">
	<select
		class="demo-select"
		onchange={(e) => {
			onUrlChange((e.target as HTMLSelectElement).value);
		}}
	>
		{#each demos as demo (demo.url)}
			<option value={demo.url}>{demo.label}</option>
		{/each}
	</select>
	<iframe
		src={selectedUrl}
		title="WebMCP Demo"
		allow="tools"
		onload={(e) => onDemoLoad?.(e.currentTarget as HTMLIFrameElement)}
		style="width:100%;height:100%;border:none;display:block;"
	></iframe>
</div>

<style>
	.panel-iframe {
		position: relative;
		grid-area: iframe;
	}

	.demo-select {
		position: absolute;
		top: 0.5rem;
		right: 0.5rem;
		z-index: 10;
		background: var(--panel);
		color: var(--fg);
		border: 1px solid var(--rule);
		border-radius: 4px;
		padding: 0.2rem 0.4rem;
		font-size: 0.7rem;
		font-family: inherit;
		cursor: pointer;
	}
</style>
