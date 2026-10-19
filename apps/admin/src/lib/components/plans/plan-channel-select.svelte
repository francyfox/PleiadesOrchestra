<script lang="ts">
	import { useIntlayer } from "svelte-intlayer";
	import { subscriptionActions } from "#lib/actions.js";
	import type { Channel, Subscription } from "#lib/api-types.js";
	import SearchSelect from "#lib/components/search-select.svelte";
	import { useActionEnhance } from "#lib/components/use-action-enhance.js";

	let {
		subscription,
		channels,
	}: { subscription: Subscription; channels: Channel[] } = $props();

	const content = useIntlayer("plans");
	const NONE = "none";
	let form: HTMLFormElement;
	let channelInput: HTMLInputElement;
	const link = useActionEnhance({ run: subscriptionActions.link });

	const options = $derived([
		{ value: NONE, label: $content.noChannel.value },
		...channels.map((channel) => ({ value: channel.id, label: channel.name })),
	]);

	function pick(value: string) {
		channelInput.value = value === NONE ? "" : value;
		form.requestSubmit();
	}
</script>

<form use:link bind:this={form}>
	<input type="hidden" name="id" value={subscription.id} />
	<input type="hidden" name="channelId" bind:this={channelInput} value={subscription.channelId ?? ""} />
	<SearchSelect
		ariaLabel={$content.linkChannel.value}
		searchPlaceholder={$content.filters.search.value}
		emptyText={$content.filters.nothingFound.value}
		{options}
		value={subscription.channelId ?? NONE}
		onValueChange={pick}
	/>
</form>
