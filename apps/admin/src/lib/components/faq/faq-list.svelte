<script lang="ts">
	import SearchIcon from "@lucide/svelte/icons/search";
	import { useIntlayer } from "svelte-intlayer";
	import { Input } from "$lib/components/ui/input/index.js";
	import { createFaqSearch } from "$lib/faq-search";
	import FaqAnswer from "./faq-answer.svelte";
	import { FAQ_IDS, type FaqId } from "./faq-items";
	import FaqQuestionList from "./faq-question-list.svelte";

	const content = useIntlayer("faq");

	let query = $state("");
	let chosen = $state<FaqId>(FAQ_IDS[0]);

	// Search covers these questions and answers only (in the current language), not "Getting started".
	const search = $derived(
		createFaqSearch(
			FAQ_IDS.map((id) => ({
				id,
				q: $content.items[id].q.value,
				a: $content.items[id].a.value,
			})),
		),
	);
	const found = $derived(search(query) as FaqId[]);
	const items = $derived(
		found.map((id) => ({ id, q: $content.items[id].q.value })),
	);
	// The user's pick if it is still in the results, otherwise the best match.
	const current = $derived(found.includes(chosen) ? chosen : found[0]);
</script>

<div class="grid gap-3">
	<div class="relative max-w-md">
		<SearchIcon class="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
		<Input
			type="search"
			bind:value={query}
			class="pl-8"
			placeholder={$content.search.placeholder.value}
			aria-label={$content.search.label.value}
			autocomplete="off"
		/>
	</div>

	<div class="grid gap-4 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
		<FaqQuestionList
			{items}
			selected={current}
			onSelect={(id) => (chosen = id as FaqId)}
			label={$content.questionsTitle.value}
		/>
		<FaqAnswer id={current} />
	</div>
</div>
