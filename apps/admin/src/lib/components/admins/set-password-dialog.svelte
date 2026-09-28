<script lang="ts">
	import { useIntlayer } from "svelte-intlayer";
	import { adminActions } from "$lib/actions";
	import { Button } from "$lib/components/ui/button/index.js";
	import * as Dialog from "$lib/components/ui/dialog/index.js";
	import { Input } from "$lib/components/ui/input/index.js";
	import type { AdminRow } from "./admin-types";
	import { useAdminEnhance } from "./use-admin-enhance";

	/** Open while `admin` is set; `onClose` clears it. */
	let { admin, onClose }: { admin: AdminRow | null; onClose: () => void } =
		$props();

	const content = useIntlayer("admins");
	const common = useIntlayer("common");
	const submitted = useAdminEnhance(adminActions.setPassword, () => onClose());
</script>

<Dialog.Root open={admin !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
	<Dialog.Content>
		{#if admin}
			<Dialog.Header><Dialog.Title>{$content.passwordTitle({ email: admin.email })}</Dialog.Title></Dialog.Header>
			<form use:submitted class="grid gap-3">
				<input type="hidden" name="id" value={admin.id} />
				<Input name="password" type="password" minlength={8} autocomplete="new-password" required />
				<Dialog.Footer>
					<Button variant="ghost" type="button" onclick={onClose}>{$common.cancel.value}</Button>
					<Button type="submit">{$common.save.value}</Button>
				</Dialog.Footer>
			</form>
		{/if}
	</Dialog.Content>
</Dialog.Root>
