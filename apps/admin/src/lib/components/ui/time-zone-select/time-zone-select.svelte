<script lang="ts">
	import SearchSelect from "#lib/components/search-select.svelte";
	import { createZoneSearch, zoneOptions } from "#lib/i18n/time-zone.js";

	const OPTIONS = zoneOptions();
	const search = createZoneSearch(OPTIONS);

	/** A searchable zone picker; the value is also a hidden input named `name`, so a plain form submits it. */
	let {
		value = $bindable("UTC"),
		name,
		ariaLabel,
		searchPlaceholder = "",
		emptyText = "",
		class: className,
	}: {
		value?: string;
		name: string;
		ariaLabel: string;
		searchPlaceholder?: string;
		emptyText?: string;
		class?: string;
	} = $props();
</script>

<input type="hidden" {name} {value} />
<SearchSelect
	{value}
	options={OPTIONS}
	filter={search}
	onValueChange={(next) => (value = next)}
	{ariaLabel}
	{searchPlaceholder}
	{emptyText}
	class={className}
/>
