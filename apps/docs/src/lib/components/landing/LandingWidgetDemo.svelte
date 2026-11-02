<script lang="ts">
	import CheckIcon from "@lucide/svelte/icons/check";
	import MessageCircleIcon from "@lucide/svelte/icons/message-circle";
	import SendIcon from "@lucide/svelte/icons/send";
	import { onMount } from "svelte";
	import { fly } from "svelte/transition";
	import { localeFromPath } from "#lib/i18n.js";
	import { landingContent } from "#lib/landing/content.js";
	import { page } from "$app/state";

	let t = $derived(
		landingContent(localeFromPath(page.url.pathname)).video.demo,
	);
	// Lines shown so far; a few idle ticks past the end before it restarts.
	let shown = $state(0);
	let reduced = $state(false);

	onMount(() => {
		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
			reduced = true;
			shown = Object.keys(t.lines).length;
			return;
		}
		const timer = setInterval(() => {
			shown = shown + 1;
		}, 1000);
		return () => clearInterval(timer);
	});
</script>

<!-- Scripted imitation of the widget (not the live one: it would need an agent and a key). -->
<figure
        class="m-0 flex w-full max-w-80 shrink-0 flex-col border border-accent! bg-bg opacity-80 shadow-[3px_3px_0_0_var(--accent)]"
        aria-label={t.aria}
>
    <figcaption
            class="flex items-center gap-2 bg-(--primary-shade) px-3 py-2 text-sm font-bold text-bg"
    >
        <MessageCircleIcon size={16} aria-hidden="true" />
        {t.title}
    </figcaption>
    <ol class="flex h-80 list-none lg:h-80 flex-col justify-end gap-2 overflow-hidden !p-3 text-sm">
        {#each Object.values(t.lines).slice(0, shown) as line, i (i)}
            <li
                    in:fly={{ y: 8, duration: reduced ? 0 : 200 }}
                    class={line.from === "user"
                        ? "max-w-[85%] self-end bg-(--primary-shade) px-3 py-2 text-bg"
                        : line.from === "bot"
                          ? "max-w-[85%] self-start bg-muted px-3 py-2 text-fg"
                          : "flex items-center gap-1.5 self-start text-xs text-dim"}
            >
                {#if line.from === "step"}<CheckIcon size={12} aria-hidden="true" />{/if}
                {line.text}
            </li>
        {/each}
    </ol>
    <div
            class="flex items-center justify-between border-t px-3 py-2 text-sm text-dim"
            aria-hidden="true"
    >
        {t.placeholder}
        <SendIcon size={16} />
    </div>
</figure>
