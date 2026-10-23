<script lang="ts">
	import { INTENT_SET_IDS } from "admin-api/forms";
	import { useIntlayer } from "svelte-intlayer";
	import { Label } from "#lib/components/ui/label/index.js";
	import { SearchMultiSelect } from "#lib/components/ui/search-multi-select/index.js";

	/** Set ids picked at the start; none = the site's own tools are the goals (the default). */
	let { selected = [] }: { selected?: string[] } = $props();

	const content = useIntlayer("channels");
	// The field is only read when the form is created; the dialog remounts it per channel.
	// svelte-ignore state_referenced_locally
	let values = $state([...selected]);
	// Set ids are the names (`shop`, `shop:dress`): English, short, not translated.
	const options = $derived(
		INTENT_SET_IDS.map((id) => ({ value: id, label: id })),
	);
</script>

<div class="grid gap-2">
	<Label>{$content.intentSets.label.value}</Label>
	<!-- No pick sends no input at all: this marker tells the form that "nothing picked" means an empty list. -->
	<input type="hidden" name="intentSetsShown" value="1" />
	<SearchMultiSelect
		bind:values
		name="intentSets"
		{options}
		ariaLabel={$content.intentSets.label.value}
		searchPlaceholder={$content.intentSets.search.value}
		emptyText={$content.intentSets.empty.value}
		clearLabel={$content.intentSets.clear.value}
		removeLabel={(label) => $content.intentSets.remove({ label })}
	/>
	<p class="text-xs text-muted-foreground">{$content.intentSets.hint.value}</p>
</div>
