<script lang="ts">
	import { useIntlayer } from "svelte-intlayer";
	import type { Channel } from "$lib/api-types";
	import { Button } from "$lib/components/ui/button/index.js";
	import { Input } from "$lib/components/ui/input/index.js";
	import type { UsersTableState } from "$lib/users-table-state";

	/** GET form: filters live in the URL, the server loads the matching page. */
	let { state, channels }: { state: UsersTableState; channels: Channel[] } =
		$props();

	const content = useIntlayer("users");
	const common = useIntlayer("common");

	const selectClass =
		"h-9 rounded-md border border-input bg-background px-2 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring";
</script>

<form method="GET" class="flex flex-wrap items-end gap-2">
	<Input name="q" placeholder={$content.filters.search.value} value={state.q ?? ""} class="w-56" />
	<select name="channel" class={selectClass} value={state.channel ?? ""}>
		<option value="">{$content.filters.allChannels.value}</option>
		{#each channels as channel (channel.id)}
			<option value={channel.slug}>{channel.name}</option>
		{/each}
	</select>
	<select name="status" class={selectClass} value={state.status ?? ""}>
		<option value="">{$content.filters.anyStatus.value}</option>
		<option value="allowed">{$common.status.allowed.value}</option>
		<option value="pending">{$common.status.pending.value}</option>
		<option value="blocked">{$common.status.blocked.value}</option>
	</select>
	<select name="kind" class={selectClass} value={state.kind ?? ""}>
		<option value="">{$content.filters.allKinds.value}</option>
		<option value="identified">{$content.filters.identified.value}</option>
		<option value="anonymous">{$content.filters.anonymous.value}</option>
	</select>
	<input type="hidden" name="sort" value={state.sort} />
	<input type="hidden" name="order" value={state.order} />
	<input type="hidden" name="limit" value={state.limit} />
	<Button type="submit" variant="secondary">{$content.filters.apply.value}</Button>
	<Button href="/users" variant="ghost">{$content.filters.reset.value}</Button>
</form>
