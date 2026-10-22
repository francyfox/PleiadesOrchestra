<script lang="ts">
	import * as Tooltip from "#lib/components/ui/tooltip/index.js";
	import { useFormat } from "#lib/i18n/use-format.js";

	/** A big number as 1.9K / 12.3M (rounded down); hover shows the exact value. */
	let { value }: { value: number | null | undefined } = $props();

	const format = useFormat();
	const shown = $derived($format.compact(value));
	const exact = $derived($format.number(value));
</script>

{#if shown === exact}
	{shown}
{:else}
	<Tooltip.Root>
		<Tooltip.Trigger class="cursor-default">{shown}</Tooltip.Trigger>
		<Tooltip.Content>{exact}</Tooltip.Content>
	</Tooltip.Root>
{/if}
