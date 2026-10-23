<script lang="ts">
	import ListIcon from "@lucide/svelte/icons/list";
	import { useIntlayer } from "svelte-intlayer";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Dialog from "#lib/components/ui/dialog/index.js";
	import { Input } from "#lib/components/ui/input/index.js";
	import {
		INTENT_SET_CATALOG,
		intentSetCodeUrl,
	} from "#lib/intent-set-catalog.js";
	import IntentSetCard from "./intent-set-card.svelte";

	const content = useIntlayer("intents");
	let open = $state(false);
	let search = $state("");

	const cards = $derived(
		INTENT_SET_CATALOG.map((set) => ({
			set,
			description: $content.sets.descriptions[set.id].value as string,
		})).filter(({ set, description }) =>
			`${set.id} ${description}`
				.toLowerCase()
				.includes(search.trim().toLowerCase()),
		),
	);
</script>

<Button variant="outline" onclick={() => (open = true)}>
	<ListIcon class="size-4" />
	{$content.sets.open.value}
</Button>

<Dialog.Root bind:open onOpenChange={(next) => { if (next) search = ""; }}>
	<Dialog.Content class="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
		<Dialog.Header>
			<Dialog.Title>{$content.sets.title.value}</Dialog.Title>
			<Dialog.Description>{$content.sets.description.value}</Dialog.Description>
		</Dialog.Header>
		<Input type="search" bind:value={search} placeholder={$content.sets.search.value} aria-label={$content.sets.search.value} />
		<div class="grid gap-2">
			{#each cards as { set, description } (set.id)}
				<IntentSetCard
					name={set.id}
					{description}
					codeHref={intentSetCodeUrl(set)}
					codeLabel={$content.sets.showCode.value}
				/>
			{:else}
				<p class="text-sm text-muted-foreground">{$content.sets.empty.value}</p>
			{/each}
		</div>
	</Dialog.Content>
</Dialog.Root>
