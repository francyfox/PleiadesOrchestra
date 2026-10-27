<script lang="ts">
	import { UpdateChannelForm } from "admin-api/forms";
	import { useIntlayer } from "svelte-intlayer";
	import { channelActions, channelOverrides } from "#lib/actions.js";
	import type { Channel } from "#lib/api-types.js";
	import FormField from "#lib/components/form-field.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Dialog from "#lib/components/ui/dialog/index.js";
	import { Label } from "#lib/components/ui/label/index.js";
	import { Switch } from "#lib/components/ui/switch/index.js";
	import { Textarea } from "#lib/components/ui/textarea/index.js";
	import { useFieldErrorText } from "#lib/forms/use-field-error-text.js";
	import AccessModeSelect from "./access-mode-select.svelte";
	import IntentSetsField from "./intent-sets-field.svelte";
	import { useChannelEnhance } from "./use-channel-enhance";

	/** Open while `channel` is set; `onClose` clears it. */
	let { channel, onClose }: { channel: Channel | null; onClose: () => void } =
		$props();

	const content = useIntlayer("channels");
	const common = useIntlayer("common");
	const submitted = useChannelEnhance(
		channelActions.update,
		() => onClose(),
		undefined,
		UpdateChannelForm,
		channelOverrides,
	);
	const errors = submitted.errors;
	const errorText = useFieldErrorText();
</script>

<Dialog.Root open={channel !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
	<Dialog.Content>
		{#if channel}
			<Dialog.Header><Dialog.Title>{$content.editTitle({ name: channel.name })}</Dialog.Title></Dialog.Header>
			<form use:submitted novalidate class="grid gap-3">
				<input type="hidden" name="id" value={channel.id} />
				<FormField id="edit-name" name="name" label={$content.create.name.value} value={channel.name} error={$errorText($errors?.name)} />
				<div class="grid gap-2">
					<Label for="edit-access">{$content.columns.access.value}</Label>
					<AccessModeSelect id="edit-access" value={channel.accessMode} />
				</div>
				{#if channel.kind === "web"}
					<FormField
						id="edit-catalog-language"
						name="catalogLanguage"
						label={$content.catalogLanguage.value}
						value={channel.catalogLanguage}
						error={$errorText($errors?.catalogLanguage)}
					/>
					<p class="-mt-2 text-xs text-muted-foreground">{$content.catalogLanguageHint.value}</p>
					{#key channel.id}
						<IntentSetsField selected={channel.intentSets} />
					{/key}
					<div class="grid gap-2">
						<!-- Off sends no input at all: the marker says the switch was on the form. -->
						<input type="hidden" name="severalTasksShown" value="1" />
						<div class="flex items-center gap-2">
							<Switch id="edit-several-tasks" name="severalTasks" checked={channel.severalTasks} />
							<Label for="edit-several-tasks">{$content.severalTasks.label.value}</Label>
						</div>
						<p class="text-xs text-muted-foreground">{$content.severalTasks.hint.value}</p>
					</div>
					<div class="grid gap-2">
						<Label for="edit-origins">{$content.allowedOrigins.value}</Label>
						<Textarea id="edit-origins" name="allowedOrigins" value={channel.allowedOrigins.join("\n")} />
					</div>
				{/if}
				<Dialog.Footer>
					<Button variant="ghost" type="button" onclick={onClose}>{$common.cancel.value}</Button>
					<Button type="submit">{$common.save.value}</Button>
				</Dialog.Footer>
			</form>
		{/if}
	</Dialog.Content>
</Dialog.Root>
