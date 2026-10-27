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
			shown = t.lines.length;
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
        class="m-0 flex w-full max-w-80 shrink-0 flex-col border opacity-80"
        aria-label={t.aria}
        style:background="var(--bg)"
        style:border-color="var(--accent)"
        style:box-shadow="3px 3px 0 0 var(--accent)"
>
    <figcaption
            class="flex items-center gap-2 px-3 py-2 text-sm font-bold"
            style:background="var(--accent)"
            style:color="var(--bg)"
    >
        <MessageCircleIcon size={16} aria-hidden="true" />
        {t.title}
    </figcaption>
    <ol class="flex h-80 list-none lg:h-80 flex-col justify-end gap-2 overflow-hidden !p-3 text-sm">
        {#each t.lines.slice(0, shown) as line, i (i)}
            <li
                    in:fly={{ y: 8, duration: reduced ? 0 : 200 }}
                    class={line.from === "user"
                        ? "max-w-[85%] self-end px-3 py-2"
                        : line.from === "bot"
                          ? "max-w-[85%] self-start px-3 py-2"
                          : "flex items-center gap-1.5 self-start text-xs"}
                    style:background={line.from === "user" ? "var(--accent)" : line.from === "bot" ? "var(--muted)" : undefined}
                    style:color={line.from === "user" ? "var(--bg)" : line.from === "step" ? "var(--dim)" : "var(--fg)"}
            >
                {#if line.from === "step"}<CheckIcon size={12} aria-hidden="true" />{/if}
                {line.text}
            </li>
        {/each}
    </ol>
    <div
            class="flex items-center justify-between border-t px-3 py-2 text-sm"
            style:border-color="var(--rule)"
            style:color="var(--dim)"
            aria-hidden="true"
    >
        {t.placeholder}
        <SendIcon size={16} />
    </div>
</figure>
