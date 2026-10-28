<script lang="ts">
	import { Handle, type NodeProps, Position } from "@xyflow/svelte";
	import { useIntlayer } from "svelte-intlayer";
	import { ChoiceOption } from "#lib/components/ui/choice-option/index.js";
	import { useFormat } from "#lib/i18n/use-format.js";
	import type { ChoiceNodeData } from "#lib/request-graph.js";

	/** One gamma question in the graph: every option in one node; `not_said` and the unlikely ones folded into one "+N more" row get readable text. */
	let { data }: NodeProps = $props();

	const content = useIntlayer("flow");
	const format = useFormat();

	const choice = $derived(data as ChoiceNodeData);
</script>

<Handle type="target" position={Position.Left} />
<div class="flex flex-col gap-1">
	<div class="w-52 truncate text-[10px] text-muted-foreground" title={choice.question}>{choice.question}{choice.round ? ` · ${choice.round}` : ""}</div>
	{#each choice.options as { option, probability, chosen } (option)}
		<ChoiceOption
			label={option === "not_said" ? $content.choices.notSaid.value : option}
			value={$format.percent(probability)}
			ratio={probability}
			{chosen}
		/>
	{/each}
	{#if choice.more > 0}
		<ChoiceOption
			label={$content.choices.more({ count: choice.more }).value}
			value={$format.percent(choice.moreProbability)}
			ratio={choice.moreProbability}
		/>
	{/if}
</div>
