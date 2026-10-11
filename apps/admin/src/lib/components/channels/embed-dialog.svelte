<script lang="ts">
	import { useIntlayer } from "svelte-intlayer";
	import type { Channel } from "$lib/api-types";
	import CodeBlock from "$lib/components/code-block.svelte";
	import * as Dialog from "$lib/components/ui/dialog/index.js";
	import { Input } from "$lib/components/ui/input/index.js";
	import { Label } from "$lib/components/ui/label/index.js";
	import {
		buildEmbedSnippetForMethod,
		buildInstallSnippet,
		PLACEHOLDER_AGENT_URL,
		UNPKG_URL,
		JSDELIVR_URL,
		type EmbedMethod,
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
	let method = $state<EmbedMethod>("cdn-unpkg");

	$effect(() => saveEmbedSettings({ scriptUrl, agentUrl }));

	const isCdn = $derived(method === "cdn-unpkg" || method === "cdn-jsdelivr");
	const isPkg = $derived(!isCdn);
	const installSnippet = $derived(buildInstallSnippet(method));

	const scriptPlaceholder = $derived(
		method === "cdn-unpkg" ? UNPKG_URL : method === "cdn-jsdelivr" ? JSDELIVR_URL : "",
	);

	const snippet = $derived(
		channel.publishableKey
			? buildEmbedSnippetForMethod(method, {
					scriptUrl,
					agentUrl,
					publishableKey: channel.publishableKey,
				})
			: "",
	);

	const methods: { id: EmbedMethod; label: string }[] = [
		{ id: "cdn-unpkg", label: "unpkg" },
		{ id: "cdn-jsdelivr", label: "jsDelivr" },
		{ id: "npm", label: "npm" },
		{ id: "pnpm", label: "pnpm" },
		{ id: "bun", label: "bun" },
	];
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-2xl">
		<Dialog.Header>
			<Dialog.Title>{$content.embed.title({ name: channel.name })}</Dialog.Title>
			<Dialog.Description>{$content.embed.description.value}</Dialog.Description>
		</Dialog.Header>

		<div class="grid gap-3">
			<div class="grid gap-1.5">
				<span class="text-sm font-medium">{$content.embed.method.value}</span>
				<div class="flex flex-wrap gap-1">
					{#each methods as m (m.id)}
						<button
							type="button"
							class="rounded-md border px-3 py-1 text-sm font-medium transition-colors
								{method === m.id
								? 'bg-primary text-primary-foreground border-primary'
								: 'border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground'}"
							onclick={() => (method = m.id)}
						>
							{m.label}
						</button>
					{/each}
				</div>
			</div>

			{#if isPkg}
				<div class="grid gap-1.5">
					<span class="text-sm font-medium">{$content.embed.install.value}</span>
					<CodeBlock code={installSnippet} label={$content.embed.copy.value} />
				</div>
			{/if}

			<div class="grid gap-1.5">
				<Label for="embed-agent">{$content.embed.agentUrl.value}</Label>
				<Input
					id="embed-agent"
					bind:value={agentUrl}
					placeholder={PLACEHOLDER_AGENT_URL}
					autocomplete="off"
				/>
				<p class="text-xs text-muted-foreground">{$content.embed.agentUrlHint.value}</p>
			</div>

			{#if isCdn}
				<div class="grid gap-1.5">
					<Label for="embed-script">{$content.embed.scriptUrl.value}</Label>
					<Input
						id="embed-script"
						bind:value={scriptUrl}
						placeholder={scriptPlaceholder}
						autocomplete="off"
					/>
					<p class="text-xs text-muted-foreground">{$content.embed.scriptUrlHint.value}</p>
				</div>
			{/if}

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
