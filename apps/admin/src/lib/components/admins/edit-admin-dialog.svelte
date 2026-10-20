<script lang="ts">
	import { useIntlayer } from "svelte-intlayer";
	import { adminActions } from "#lib/actions.js";
	import FormField from "#lib/components/form-field.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Dialog from "#lib/components/ui/dialog/index.js";
	import type { AdminRow } from "./admin-types";
	import { useAdminEnhance } from "./use-admin-enhance";

	/** Open while `admin` is set; `onClose` clears it. Name and email only: staff have no password. */
	let { admin, onClose }: { admin: AdminRow | null; onClose: () => void } =
		$props();

	const content = useIntlayer("admins");
	const common = useIntlayer("common");
	// Closes only on success: a refused email (taken, malformed) keeps the dialog and the input.
	const submitted = useAdminEnhance(adminActions.edit, undefined, () =>
		onClose(),
	);
</script>

<Dialog.Root open={admin !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
	<Dialog.Content>
		{#if admin}
			<Dialog.Header><Dialog.Title>{$content.editTitle({ email: admin.email })}</Dialog.Title></Dialog.Header>
			<form use:submitted class="grid gap-3">
				<input type="hidden" name="id" value={admin.id} />
				<FormField id="edit-name" name="name" label={$content.columns.name.value} value={admin.name} />
				<FormField id="edit-email" name="email" label={$content.columns.email.value} type="email" value={admin.email} required />
				<Dialog.Footer>
					<Button variant="ghost" type="button" onclick={onClose}>{$common.cancel.value}</Button>
					<Button type="submit">{$common.save.value}</Button>
				</Dialog.Footer>
			</form>
		{/if}
	</Dialog.Content>
</Dialog.Root>
