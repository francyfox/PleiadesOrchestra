<script lang="ts">
	import { useIntlayer } from "svelte-intlayer";
	import type { AccessMode } from "$lib/api-types";

	let { id, value = "open" }: { id: string; value?: AccessMode } = $props();

	const content = useIntlayer("channels");
</script>

<select
	{id}
	name="accessMode"
	{value}
	class="h-9 rounded-md border border-input bg-background px-2 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
>
	<option value="open">{$content.accessMode.open.value}</option>
	<option value="whitelist">{$content.accessMode.whitelist.value}</option>
</select>
