<script lang="ts">
	// Install tabs on the widget page: the same methods as the admin's embed picker
	// (apps/admin widget-embed.svelte). Snippets are literal here: the docs app does not import admin code.
	import { codeToHtml } from "shiki";
	import { type Locale, localeFromPath } from "#lib/i18n.js";
	import { page } from "$app/state";

	const ELEMENT = `<pleiades-chat
  agent-url="https://agent.example.com"
  publishable-key="pk_your_channel_key"
></pleiades-chat>`;
	// Joined, not written out: a literal closing script tag would end this component's own script block.
	const SCRIPT_CLOSE = ["<", "/script>"].join("");
	const cdn = (url: string) =>
		`<script src="${url}" defer>${SCRIPT_CLOSE}\n\n${ELEMENT}`;
	const npmImport = `import "@shalotts/pleiades-widget"; // registers <pleiades-chat>\n\n${ELEMENT}`;
	const TABS = [
		{
			id: "unpkg",
			label: "unpkg",
			blocks: [
				{
					lang: "html",
					code: cdn(
						"https://unpkg.com/@shalotts/pleiades-widget/dist/pleiades-widget.js",
					),
				},
			],
		},
		{
			id: "jsdelivr",
			label: "jsDelivr",
			blocks: [
				{
					lang: "html",
					code: cdn(
						"https://cdn.jsdelivr.net/npm/@shalotts/pleiades-widget/dist/pleiades-widget.js",
					),
				},
			],
		},
		{
			id: "npm",
			label: "npm",
			blocks: [
				{ lang: "sh", code: "npm install @shalotts/pleiades-widget" },
				{ lang: "js", code: npmImport },
			],
		},
		{
			id: "pnpm",
			label: "pnpm",
			blocks: [
				{ lang: "sh", code: "pnpm add @shalotts/pleiades-widget" },
				{ lang: "js", code: npmImport },
			],
		},
		{
			id: "bun",
			label: "bun",
			blocks: [
				{ lang: "sh", code: "bun add @shalotts/pleiades-widget" },
				{ lang: "js", code: npmImport },
			],
		},
		{
			id: "npm-jsr",
			label: "npm:jsr",
			blocks: [
				{ lang: "sh", code: "npx jsr add @shalotts/pleiades-widget" },
				{ lang: "js", code: npmImport },
			],
		},
		{
			id: "pnpm-jsr",
			label: "pnpm:jsr",
			blocks: [
				{ lang: "sh", code: "pnpm dlx jsr add @shalotts/pleiades-widget" },
				{ lang: "js", code: npmImport },
			],
		},
		{
			id: "bun-jsr",
			label: "bun:jsr",
			blocks: [
				{ lang: "sh", code: "bunx jsr add @shalotts/pleiades-widget" },
				{ lang: "js", code: npmImport },
			],
		},
	];

	const LABELS: Record<Locale, string> = {
		en: "Install method",
		ru: "Способ установки",
		kk: "Орнату әдісі",
	};
	const locale = $derived(localeFromPath(page.url.pathname));

	// Same grammars as the docs' Markdown fences; light and dark colours come from CSS variables.
	const highlight = (code: string, lang: string) =>
		codeToHtml(code, {
			lang,
			themes: { light: "github-light", dark: "github-dark" },
			defaultColor: false,
		});

	let selected = $state("unpkg");
	// Plain code in the prerendered HTML; the selected tab is highlighted in the browser (shiki is async, SSR does not wait).
	let highlighted = $state<Record<string, string>>({});

	$effect(() => {
		const tab = TABS.find((t) => t.id === selected);
		tab?.blocks.forEach(async (block, i) => {
			const key = `${tab.id}-${i}`;
			if (!highlighted[key])
				highlighted[key] = await highlight(block.code, block.lang);
		});
	});
</script>

<div class="install">
	<div class="tabs" role="tablist" aria-label={LABELS[locale]} lang={locale}>
		{#each TABS as tab (tab.id)}
			<button
				type="button"
				role="tab"
				id="install-tab-{tab.id}"
				aria-selected={selected === tab.id}
				aria-controls="install-panel-{tab.id}"
				class:active={selected === tab.id}
				onclick={() => (selected = tab.id)}
			>
				{tab.label}
			</button>
		{/each}
	</div>
	{#each TABS as tab (tab.id)}
		{#if selected === tab.id}
			<div role="tabpanel" id="install-panel-{tab.id}" aria-labelledby="install-tab-{tab.id}" class="panel">
				{#each tab.blocks as block, i (block.code)}
					{#if highlighted[`${tab.id}-${i}`]}
						<div class="code">{@html highlighted[`${tab.id}-${i}`]}</div>
					{:else}
						<pre><code>{block.code}</code></pre>
					{/if}
				{/each}
			</div>
		{/if}
	{/each}
</div>

<style>
	/* Neutral greys: --card and --accent are warm/red in dark mode, so the tabs do not use them. */
	.install {
		margin: 1rem 0;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		overflow: hidden;
	}
	.tabs {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
		padding: 0.5rem;
		border-bottom: 1px solid var(--border);
		background: color-mix(in oklch, var(--foreground) 8%, transparent);
	}
	.tabs button {
		border: 1px solid transparent;
		border-radius: calc(var(--radius) - 2px);
		background: transparent;
		color: var(--muted-foreground);
		padding: 0.3rem 0.75rem;
		font: inherit;
		font-size: 0.85rem;
		cursor: pointer;
	}
	.tabs button:hover {
		color: var(--foreground);
	}
	.tabs button:focus-visible {
		outline: 2px solid var(--ring);
		outline-offset: 2px;
	}
	.tabs button.active {
		background: color-mix(in oklch, var(--foreground) 16%, transparent);
		border-color: var(--border);
		color: var(--foreground);
		font-weight: 600;
	}
	.panel {
		display: grid;
		gap: 0.5rem;
		padding: 0.75rem;
	}
	.panel pre,
	.panel :global(pre) {
		margin: 0;
		overflow-x: auto;
		font-size: 0.85rem;
		padding: 0.75rem;
		border-radius: calc(var(--radius) - 2px);
		background: color-mix(in oklch, var(--foreground) 6%, transparent);
	}
	/* Shiki writes both colours as variables; the .dark class on <html> picks the dark one. */
	.panel :global(.shiki) {
		background: transparent !important;
		overflow-x: auto;
		margin: 0;
		padding: 0.75rem;
		border-radius: calc(var(--radius) - 2px);
		font-size: 0.85rem;
	}
	.panel :global(.shiki span) {
		color: var(--shiki-light);
	}
	:global(.dark) .panel :global(.shiki span) {
		color: var(--shiki-dark);
	}
</style>
