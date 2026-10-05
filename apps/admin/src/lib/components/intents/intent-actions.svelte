<script lang="ts">
	import CheckIcon from "@lucide/svelte/icons/check";
	import ExternalLinkIcon from "@lucide/svelte/icons/external-link";
	import PencilIcon from "@lucide/svelte/icons/pencil";
	import XIcon from "@lucide/svelte/icons/x";
	import { useIntlayer } from "svelte-intlayer";
	import { intentActions } from "$lib/actions";
	import type { IntentExample } from "$lib/api-types";
	import IconButton from "$lib/components/icon-button.svelte";
	import SearchSelect from "$lib/components/search-select.svelte";
	import { Button } from "$lib/components/ui/button/index.js";
	import * as Dialog from "$lib/components/ui/dialog/index.js";
	import { useActionEnhance } from "$lib/components/use-action-enhance";
	import { REQUEST_INTENTS } from "$lib/flow-filters";

	/** Approve, reject, correct (a dialog with the intent picker) and open the request the label came from. */
	let { item }: { item: IntentExample } = $props();

	const content = useIntlayer("intents");
	const common = useIntlayer("common");

	let correcting = $state(false);
	let chosen = $state("");
	const approve = useActionEnhance({ run: intentActions.judge });
	const reject = useActionEnhance({ run: intentActions.judge });
	const correct = useActionEnhance({
		run: intentActions.judge,
		onSettled: () => (correcting = false),
	});
	const options = REQUEST_INTENTS.map((value) => ({ value, label: value }));
</script>

<div class="flex justify-end gap-1">
	{#if item.status !== "approved"}
		<form use:approve>
			<input type="hidden" name="id" value={item.id} />
			<input type="hidden" name="status" value="approved" />
			<IconButton icon={CheckIcon} tone="success" label={$content.actions.approve.value} type="submit" />
		</form>
	{/if}
	{#if item.status !== "rejected"}
		<form use:reject>
			<input type="hidden" name="id" value={item.id} />
			<input type="hidden" name="status" value="rejected" />
			<IconButton icon={XIcon} tone="danger" label={$content.actions.reject.value} type="submit" />
		</form>
	{/if}
	<IconButton
		icon={PencilIcon}
		tone="primary"
		label={$content.actions.correct.value}
		onclick={() => {
			chosen = item.intent;
			correcting = true;
		}}
	/>
	{#if item.planRunId}
		<Button
			variant="ghost"
			size="icon-sm"
			href={`/flow/${encodeURIComponent(item.planRunId)}`}
			aria-label={$content.actions.openRequest.value}
			title={$content.actions.openRequest.value}
		>
			<ExternalLinkIcon class="size-4" />
		</Button>
	{/if}
</div>

<Dialog.Root bind:open={correcting}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>{$content.correctDialog.title.value}</Dialog.Title>
			<Dialog.Description>{$content.correctDialog.description.value}</Dialog.Description>
		</Dialog.Header>
		<form use:correct class="grid gap-3">
			<p class="rounded-md bg-muted p-2 text-sm break-words">{item.sample}</p>
			<input type="hidden" name="id" value={item.id} />
			<input type="hidden" name="intent" value={chosen} />
			<SearchSelect
				class="w-full"
				ariaLabel={$content.columns.intent.value}
				searchPlaceholder={$content.filters.search.value}
				emptyText={$content.filters.nothingFound.value}
				options={options}
				value={chosen}
				onValueChange={(value) => (chosen = value)}
			/>
			<Dialog.Footer>
				<Button variant="ghost" type="button" onclick={() => (correcting = false)}>{$common.cancel.value}</Button>
				<Button type="submit">{$content.correctDialog.save.value}</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
