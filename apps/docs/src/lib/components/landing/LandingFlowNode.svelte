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
		: 'w-56'} bg-bg {status === 'idle' || status === 'rejected' ? '' : 'border-accent!'} {status === 'active'
		? 'shadow-[3px_3px_0_0_var(--accent)]'
		: 'shadow-none'} {status === 'idle' ? 'opacity-35' : status === 'rejected' ? 'opacity-55' : 'opacity-100'}"
>
	<Handle type="target" position={data.in as Position} isConnectable={false} />
	{#if option}
		<span class="text-sm"><code>{data.text}</code></span>
	{:else}
		<span class="text-md font-bold text-(--primary-shade)">{data.tag}</span>
		<span class="text-sm text-fg">{data.text}</span>
		{#if data.meta}
			<span class="text-sm tabular-nums text-dim">{data.meta}</span>
		{/if}
	{/if}
	<Handle type="source" position={data.out as Position} isConnectable={false} />
</div>
