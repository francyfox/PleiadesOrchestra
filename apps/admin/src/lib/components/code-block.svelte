<script lang="ts">
	import { type CodeLanguage, highlight } from "$lib/highlight";
	import CopyButton from "./copy-button.svelte";

	/** A highlighted (Prism) code sample with a copy button; `label` names it for the button. */
	let {
		code,
		lang = "markup",
		label,
	}: { code: string; lang?: CodeLanguage; label?: string } = $props();

	// Prism escapes the code itself, so this is markup made of our own spans only.
	const html = $derived(highlight(code, lang));
</script>

<div class="code relative">
	<pre class="overflow-x-auto rounded-md bg-muted p-3 pr-10 font-mono text-xs"><code>{@html html}</code></pre>
	<div class="absolute top-1.5 right-1.5">
		<CopyButton value={code} {label} />
	</div>
</div>

<style>
	/* Prism token colours, tuned to the theme in both modes (no Prism stylesheet is loaded). */
	.code :global(.token.tag),
	.code :global(.token.keyword),
	.code :global(.token.function) {
		color: #b45309;
	}
	.code :global(.token.attr-name),
	.code :global(.token.parameter),
	.code :global(.token.variable) {
		color: #0369a1;
	}
	.code :global(.token.attr-value),
	.code :global(.token.string) {
		color: #15803d;
	}
	.code :global(.token.punctuation),
	.code :global(.token.operator) {
		color: #78716c;
	}
	.code :global(.token.comment) {
		color: #a8a29e;
		font-style: italic;
	}
	:global(.dark) .code :global(.token.tag),
	:global(.dark) .code :global(.token.keyword),
	:global(.dark) .code :global(.token.function) {
		color: #fbbf24;
	}
	:global(.dark) .code :global(.token.attr-name),
	:global(.dark) .code :global(.token.parameter),
	:global(.dark) .code :global(.token.variable) {
		color: #7dd3fc;
	}
	:global(.dark) .code :global(.token.attr-value),
	:global(.dark) .code :global(.token.string) {
		color: #86efac;
	}
	:global(.dark) .code :global(.token.punctuation),
	:global(.dark) .code :global(.token.operator) {
		color: #a8a29e;
	}
</style>
