<script lang="ts">
	import { Handle, type NodeProps, Position } from "@xyflow/svelte";
	import { useIntlayer } from "svelte-intlayer";
	import { ChoiceOption } from "#lib/components/ui/choice-option/index.js";
	import { useFormat } from "#lib/i18n/use-format.js";

	/** One option of a gamma question in the graph; `not_said` and the "+N more" tail get readable text. */
	let { data, selected }: NodeProps = $props();

	const content = useIntlayer("flow");
	const format = useFormat();

	const more = $derived(typeof data.more === "number" ? data.more : null);
	const option = $derived(String(data.option ?? ""));
	const label = $derived(
		more !== null
			? $content.choices.more({ count: more }).value
			: option === "not_said"
				? $content.choices.notSaid.value
				: option,
	);
</script>

<Handle type="target" position={Position.Left} />
<ChoiceOption
	{label}
	value={typeof data.probability === "number" ? $format.percent(data.probability) : ""}
	ratio={typeof data.probability === "number" ? data.probability : 0}
	chosen={data.chosen === true}
	{selected}
	question={data.first === true ? String(data.question ?? "") : undefined}
/>
