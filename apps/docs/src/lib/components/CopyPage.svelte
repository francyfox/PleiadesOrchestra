<script lang="ts">
	import FileCodeIcon from "@lucide/svelte/icons/file-code";
	import FileTextIcon from "@lucide/svelte/icons/file-text";
	import TypeIcon from "@lucide/svelte/icons/type";
	import ChatGptIcon from "#lib/components/brand-icons/ChatGptIcon.svelte";
	import ClaudeIcon from "#lib/components/brand-icons/ClaudeIcon.svelte";
	import type { Locale } from "#lib/i18n.js";

	// Put at the top of every docs page by vite/content-routes.ts. `markdown` is the
	// page's clean Markdown (static, generated next to the page; llmstxt.org), `llms` its llms.txt.
	let {
		locale,
		markdown,
		llms,
	}: { locale: Locale; markdown: string; llms: string } = $props();

	const labels: Record<
		Locale,
		{
			markdown: string;
			text: string;
			open: string;
			copied: string;
			failed: string;
			ask: (page: string, markdown: string) => string;
		}
	> = {
		en: {
			markdown: "Copy Markdown",
			text: "Copy text",
			open: "Markdown",
			copied: "Copied",
			failed: "Copy failed",
			ask: (page, md) =>
				`I'm reading ${page} (Markdown: ${md}). Please explain it, summarize the key ideas and answer my questions about it.`,
		},
		ru: {
			markdown: "Копировать Markdown",
			text: "Копировать текст",
			open: "Markdown",
			copied: "Скопировано",
			failed: "Не удалось скопировать",
			ask: (page, md) =>
				`Я читаю ${page} (Markdown: ${md}). Объясни, о чём это, кратко перескажи главное и ответь на мои вопросы.`,
		},
		kk: {
			markdown: "Markdown көшіру",
			text: "Мәтінді көшіру",
			open: "Markdown",
			copied: "Көшірілді",
			failed: "Көшіру сәтсіз аяқталды",
			ask: (page, md) =>
				`Мен ${page} бетін оқып отырмын (Markdown: ${md}). Не туралы екенін түсіндіріп, негізгі ойларын қысқаша айтып, сұрақтарыма жауап бер.`,
		},
	};
	const t = $derived(labels[locale]);

	let root: HTMLElement;

	// "Open in ChatGPT/Claude" need absolute URLs; the page is prerendered, so they are filled in the browser.
	let here = $state({ origin: "", path: "" });
	$effect(() => {
		here = { origin: location.origin, path: location.pathname };
	});
	const prompt = $derived(
		encodeURIComponent(
			t.ask(`${here.origin}${here.path}`, `${here.origin}${markdown}`),
		),
	);
	let status = $state("");

	/** The page as the reader sees it: the rendered content without these buttons. */
	function pageText(): string {
		const content = root.closest(".content") ?? document.body;
		root.hidden = true;
		const text = (content as HTMLElement).innerText;
		root.hidden = false;
		return text.trim();
	}

	async function copy(read: () => string | Promise<string>) {
		try {
			await navigator.clipboard.writeText(await read());
			status = t.copied;
		} catch {
			status = t.failed;
		}
		setTimeout(() => (status = ""), 2000);
	}

	const readMarkdown = async () => {
		const response = await fetch(markdown);
		if (!response.ok) throw new Error(`${response.status}`);
		return response.text();
	};
</script>

<svelte:head>
	<!-- llmstxt.org discovery: this page's Markdown and the llms.txt that covers it. -->
	<link rel="alternate" type="text/markdown" href={markdown} />
	<link rel="describedby" type="text/plain" href={llms} />
</svelte:head>

<!-- Not in the search index: the button labels would show up in every excerpt. -->
<div class="copy-page" data-pagefind-ignore bind:this={root}>
	<button type="button" onclick={() => copy(readMarkdown)}><FileCodeIcon aria-hidden="true" />{t.markdown}</button>
	<button type="button" onclick={() => copy(pageText)}><TypeIcon aria-hidden="true" />{t.text}</button>
	<a href={markdown} target="_blank" rel="noopener"><FileTextIcon aria-hidden="true" />{t.open}</a>
	<a href={`https://chatgpt.com/?prompt=${prompt}`} target="_blank" rel="noopener noreferrer"><ChatGptIcon />ChatGPT</a>
	<a href={`https://claude.ai/new?q=${prompt}`} target="_blank" rel="noopener noreferrer"><ClaudeIcon />Claude</a>
	<span class="status" role="status">{status}</span>
</div>

<style>
	.copy-page {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
		margin: 0.5rem 0 1rem;
		font-size: 0.8rem;
	}
	button,
	a {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.25rem 0.6rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--card);
		color: var(--foreground);
		font: inherit;
		text-decoration: none;
		cursor: pointer;
		box-shadow: var(--shadow-xs);
	}
	button:hover,
	a:hover {
		background: var(--primary);
		background-image: var(--gradient-primary);
		color: var(--primary-foreground);
	}
	.copy-page :global(svg) {
		width: 1em;
		height: 1em;
		flex: none;
	}
	.status {
		color: var(--muted-foreground);
	}
</style>
