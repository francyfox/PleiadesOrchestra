<script lang="ts">
	import { createQuery } from "@tanstack/svelte-query";
	import { useIntlayer } from "svelte-intlayer";
	import chibiFire from "#lib/assets/chibi-fire.webp";
	import { Button } from "#lib/components/ui/button/index.js";
	import { NoticeDialog } from "#lib/components/ui/notice-dialog/index.js";
	import { queries } from "#lib/query/queries.js";
	import { resolve } from "$app/paths";
	import { page } from "$app/state";

	/** Customers only (staff get 403): opens once per page load while the channels are paused for want of balance; not on /billing itself. */
	const standing = createQuery(() => queries.standing());
	const content = useIntlayer("billing");
	let dismissed = $state(false);
	const open = $derived(
		!dismissed &&
			standing.data?.ok === false &&
			page.url.pathname !== resolve("billing"),
	);
</script>

<NoticeDialog
	bind:open={() => open, (value) => (dismissed = !value)}
	title={$content.noBalance.title.value}
	description={$content.noBalance.body.value}
	image={chibiFire}
	imageAlt={$content.noBalance.imageAlt.value}
>
	{#snippet actions()}
		<Button
		    onclick={() => (dismissed = true)}
		>
		    {$content.noBalance.ok.value}
		</Button>
		<Button
		    href={resolve("billing")}
			variant="secondary"
			onclick={() => (dismissed = true)}
		>
		    {$content.noBalance.topUp.value}
		</Button>
	{/snippet}
</NoticeDialog>
