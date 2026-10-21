<script lang="ts">
	import { createQuery } from "@tanstack/svelte-query";
	import { useIntlayer } from "svelte-intlayer";
	import type { Customer } from "#lib/api-types.js";
	import BillingDetails from "#lib/components/billing/billing-details.svelte";
	import * as Dialog from "#lib/components/ui/dialog/index.js";
	import { queries } from "#lib/query/queries.js";

	let { user, open = $bindable(false) }: { user: Customer; open?: boolean } =
		$props();

	const content = useIntlayer("billing");
	// One request, only once the dialog is opened: the table itself stays a single call.
	const billing = createQuery(() => ({
		...queries.accountBilling(user.id),
		enabled: open,
	}));
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="max-h-[90vh] w-full max-w-[min(48rem,calc(100vw-2rem))] overflow-y-auto">
		<Dialog.Header>
			<Dialog.Title>{$content.staff.title({ email: user.email })}</Dialog.Title>
		</Dialog.Header>
		{#if billing.data}
			<BillingDetails billing={billing.data} />
		{/if}
	</Dialog.Content>
</Dialog.Root>
