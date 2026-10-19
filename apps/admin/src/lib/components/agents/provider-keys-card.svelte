<script lang="ts">
	import { createQuery } from "@tanstack/svelte-query";
	import { useIntlayer } from "svelte-intlayer";
	import { providerKeyActions } from "#lib/actions.js";
	import FormField from "#lib/components/form-field.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Card from "#lib/components/ui/card/index.js";
	import { useActionEnhance } from "#lib/components/use-action-enhance.js";
	import { queries } from "#lib/query/queries.js";
	import ProviderKeyRow from "./provider-key-row.svelte";

	const content = useIntlayer("agents");
	const common = useIntlayer("common");
	const query = createQuery(() => queries.providerKeys());
	const save = useActionEnhance({
		run: providerKeyActions.save,
		resetOnSuccess: true,
	});
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{$content.keys.title.value}</Card.Title>
		<Card.Description>{$content.keys.hint.value}</Card.Description>
	</Card.Header>
	<Card.Content class="grid gap-4">
		<ul class="divide-y">
			{#each query.data?.items ?? [] as item (item.name)}
				<ProviderKeyRow {item} />
			{:else}
				<li class="py-1 text-sm text-muted-foreground">{$content.keys.empty.value}</li>
			{/each}
		</ul>
		<form use:save class="flex flex-wrap items-end gap-3">
			<FormField id="key-name" name="name" label={$content.keys.name.value} placeholder="openrouter" required />
			<FormField id="key-value" name="key" type="password" label={$content.keys.key.value} autocomplete="off" required />
			<Button type="submit">{$common.save.value}</Button>
		</form>
		<p class="text-xs text-muted-foreground">{$content.keys.saveHint.value}</p>
	</Card.Content>
</Card.Root>
