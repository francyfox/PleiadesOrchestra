<script lang="ts">
	import { useIntlayer } from "svelte-intlayer";
	import type { Channel } from "$lib/api-types";
	import CodeBlock from "$lib/components/code-block.svelte";
	import * as Dialog from "$lib/components/ui/dialog/index.js";
	import { Input } from "$lib/components/ui/input/index.js";
	import { Label } from "$lib/components/ui/label/index.js";
	import {
		buildEmbedSnippet,
		PLACEHOLDER_AGENT_URL,
		PLACEHOLDER_SCRIPT_URL,
	} from "$lib/embed-snippet";
	import { loadEmbedSettings, saveEmbedSettings } from "./embed-storage";

	/** The HTML to paste into the channel's site; only ever the PUBLIC key goes into it. */
	let {
		channel,
		open = $bindable(false),
	}: { channel: Channel; open?: boolean } = $props();

	const content = useIntlayer("channels");

	const saved = loadEmbedSettings();
	let scriptUrl = $state(saved.scriptUrl);
	let agentUrl = $state(saved.agentUrl);

	$effect(() => saveEmbedSettings({ scriptUrl, agentUrl }));

	const snippet = $derived(
		channel.publishableKey
			? buildEmbedSnippet({
					scriptUrl,
					agentUrl,
					publishableKey: channel.publishableKey,
				})
			: "",
	);
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-2xl">
		<Dialog.Header>
			<Dialog.Title>{$content.embed.title({ name: channel.name })}</Dialog.Title>
			<Dialog.Description>{$content.embed.description.value}</Dialog.Description>
		</Dialog.Header>

		<div class="grid gap-3">
			<div class="grid gap-1.5">
				<Label for="embed-agent">{$content.embed.agentUrl.value}</Label>
				<Input id="embed-agent" bind:value={agentUrl} placeholder={PLACEHOLDER_AGENT_URL} autocomplete="off" />
				<p class="text-xs text-muted-foreground">{$content.embed.agentUrlHint.value}</p>
			</div>
			<div class="grid gap-1.5">
				<Label for="embed-script">{$content.embed.scriptUrl.value}</Label>
				<Input id="embed-script" bind:value={scriptUrl} placeholder={PLACEHOLDER_SCRIPT_URL} autocomplete="off" />
				<p class="text-xs text-muted-foreground">{$content.embed.scriptUrlHint.value}</p>
			</div>

			<div class="grid gap-1.5">
				<span class="text-sm font-medium">{$content.embed.snippet.value}</span>
				<CodeBlock code={snippet} label={$content.embed.copy.value} />
			</div>

			<ul class="grid gap-1 text-xs text-muted-foreground">
				<li>{$content.embed.publicOnly.value}</li>
				<li>
					{#if channel.allowedOrigins.length > 0}
						{$content.embed.origins({ origins: channel.allowedOrigins.join(", ") })}
					{:else}
						<span class="text-destructive">{$content.embed.noOrigins.value}</span>
					{/if}
				</li>
			</ul>
		</div>
	</Dialog.Content>
</Dialog.Root>
