<script lang="ts">
	import { useIntlayer } from "svelte-intlayer";
	import type { Channel } from "#lib/api-types.js";
	import * as Dialog from "#lib/components/ui/dialog/index.js";
	import WidgetEmbed from "#lib/components/widget-embed.svelte";

	let {
		channel,
		open = $bindable(false),
	}: { channel: Channel; open?: boolean } = $props();

	const content = useIntlayer("channels");
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="w-full max-w-[min(42rem,calc(100vw-2rem))]">
		<Dialog.Header>
			<Dialog.Title>{$content.embed.title({ name: channel.name })}</Dialog.Title>
			<Dialog.Description>{$content.embed.description.value}</Dialog.Description>
		</Dialog.Header>

		<WidgetEmbed
			publishableKey={channel.publishableKey ?? "pk_YOUR_PUBLIC_KEY"}
			allowedOrigins={channel.allowedOrigins}
		/>
	</Dialog.Content>
</Dialog.Root>
