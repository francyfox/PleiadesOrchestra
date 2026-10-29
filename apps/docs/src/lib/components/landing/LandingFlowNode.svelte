<script lang="ts">
	import { Handle, type NodeProps, type Position } from "@xyflow/svelte";

	/** One step of the flow demo: who does it (tag), what happens (text), its time and price (meta), how far the run is (status). */
	let { data }: NodeProps = $props();

	const status = $derived(String(data.status));
	const option = $derived(data.option === true);
</script>

<div
	class="flex flex-col gap-1 border px-3 py-2 transition-[opacity,border-color,box-shadow] duration-300 {option
		? 'w-48'
		: 'w-52'}"
	style:background="var(--bg)"
	style:border-color={status === "idle" || status === "rejected" ? "var(--rule)" : "var(--accent)"}
	style:box-shadow={status === "active" ? "3px 3px 0 0 var(--accent)" : "none"}
	style:opacity={status === "idle" ? 0.35 : status === "rejected" ? 0.55 : 1}
>
	<Handle type="target" position={data.in as Position} isConnectable={false} />
	{#if option}
		<span class="text-xs"><code>{data.text}</code></span>
	{:else}
		<span class="text-xs font-bold" style:color="var(--accent)">{data.tag}</span>
		<span class="text-xs" style:color="var(--fg)">{data.text}</span>
		{#if data.meta}
			<span class="text-xs tabular-nums" style:color="var(--dim)">{data.meta}</span>
		{/if}
	{/if}
	<Handle type="source" position={data.out as Position} isConnectable={false} />
</div>
