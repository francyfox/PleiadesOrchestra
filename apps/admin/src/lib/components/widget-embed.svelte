<script lang="ts">
	import { useIntlayer } from "svelte-intlayer";
	import CodeBlock from "#lib/components/code-block.svelte";
	import * as Tabs from "#lib/components/ui/tabs/index.js";
	import {
		buildEmbedSnippetForMethod,
		buildInstallSnippet,
		type EmbedMethod,
	} from "#lib/embed-snippet.js";

	let {
		publishableKey = "pk_YOUR_PUBLIC_KEY",
		allowedOrigins,
	}: {
		publishableKey?: string;
		allowedOrigins?: string[];
	} = $props();

	const content = useIntlayer("channels");

	let method = $state<EmbedMethod>("cdn-unpkg");

	const methods: { id: EmbedMethod; label: string }[] = [
		{ id: "cdn-unpkg", label: "unpkg" },
		{ id: "cdn-jsdelivr", label: "jsDelivr" },
		{ id: "npm", label: "npm" },
		{ id: "pnpm", label: "pnpm" },
		{ id: "bun", label: "bun" },
		{ id: "npm-jsr", label: "npm:jsr" },
		{ id: "pnpm-jsr", label: "pnpm:jsr" },
		{ id: "bun-jsr", label: "bun:jsr" },
	];

	const [cdnUnpkg, cdnJsdelivr, ...pkgMethods] = methods;
	const cdnMethods = [cdnUnpkg, cdnJsdelivr];

	function buildSnippet(m: EmbedMethod): string {
		return buildEmbedSnippetForMethod(m, {
			scriptUrl: "",
			agentUrl: "",
			publishableKey,
		});
	}
</script>

<div class="grid min-w-0 gap-3">
	<div class="grid min-w-0 gap-1.5">
		<div class="flex flex-col gap-0.5 overflow-hidden">
			<span class="text-sm font-medium">{$content.embed.method.value}</span>
			<Tabs.Root bind:value={method}>
				<div class="overflow-x-auto">
					<Tabs.List class="w-max">
						{#each methods as m (m.id)}
							<Tabs.Trigger value={m.id}>{m.label}</Tabs.Trigger>
						{/each}
					</Tabs.List>
				</div>

				{#each cdnMethods as { id } (id)}
					<Tabs.Content value={id} class="mt-2 grid gap-3 rounded-md border bg-muted/40 p-3">
						<CodeBlock code={buildSnippet(id)} lang="markup" label={$content.embed.copy.value} />
					</Tabs.Content>
				{/each}

				{#each pkgMethods as { id } (id)}
					<Tabs.Content value={id} class="mt-2 grid gap-3 rounded-md border bg-muted/40 p-3">
						<CodeBlock code={buildInstallSnippet(id)} lang="bash" label={$content.embed.copy.value} />
						<CodeBlock code={buildSnippet(id)} lang="javascript" label={$content.embed.copy.value} />
					</Tabs.Content>
				{/each}
			</Tabs.Root>
		</div>
	</div>

	{#if allowedOrigins !== undefined}
		<ul class="grid gap-1 text-xs text-muted-foreground">
			<li>{$content.embed.publicOnly.value}</li>
			<li>
				{#if allowedOrigins.length > 0}
					{$content.embed.origins({ origins: allowedOrigins.join(", ") })}
				{:else}
					<span class="text-destructive">{$content.embed.noOrigins.value}</span>
				{/if}
			</li>
		</ul>
	{/if}
</div>
