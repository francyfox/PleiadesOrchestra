<script lang="ts">
	import { useIntlayer } from "svelte-intlayer";
	import type { RequestNode } from "$lib/api-types";
	import { formatGoal } from "$lib/goap-facts";
	import { useFormat } from "$lib/i18n/use-format";

	/** Everything the BFF knows about one node: arguments, the tool's answer, effects, model calls. */
	let { node }: { node: RequestNode } = $props();

	const content = useIntlayer("goap");
	const format = useFormat();

	type Status = keyof typeof $content.nodeStatus;
	const detail = $derived(node.detail);
	const args = $derived(
		detail.toolArgs ? JSON.stringify(detail.toolArgs, null, 2) : null,
	);
</script>

{#snippet row(label: string, value: string | null | undefined, mono = false)}
	{#if value}
		<div class="grid grid-cols-[9rem_1fr] gap-2 py-1 text-sm">
			<div class="text-muted-foreground">{label}</div>
			<div class={mono ? "font-mono text-xs whitespace-pre-wrap break-words" : "whitespace-pre-wrap break-words"}>{value}</div>
		</div>
	{/if}
{/snippet}

<div class="divide-y">
	{@render row($content.detail.status.value, $content.nodeStatus[node.status as Status].value)}
	{#if node.durationMs !== null && node.kind !== "prompt"}
		{@render row($content.detail.time.value, $format.ms(node.durationMs))}
	{/if}
	{#if node.kind === "prompt"}
		{@render row($content.detail.text.value, detail.text)}
	{/if}
	{#if node.kind === "understand"}
		{@render row($content.detail.intent.value, detail.intent)}
		{@render row($content.detail.goal.value, detail.goal ? formatGoal(detail.goal) : null)}
	{/if}
	{#if node.kind === "result"}
		{@render row($content.detail.reply.value, detail.text ?? $content.detail.noReply.value)}
	{/if}
	{@render row($content.detail.tool.value, detail.tool)}
	{@render row($content.detail.args.value, args, true)}
	{#if detail.browserMs !== null}
		{@render row($content.detail.browser.value, $format.ms(detail.browserMs))}
	{/if}
	{#if node.kind === "action"}
		{@render row($content.detail.answer.value, detail.text, true)}
		{@render row($content.detail.expected.value, detail.expected && Object.keys(detail.expected).length ? formatGoal(detail.expected) : null, true)}
		{@render row($content.detail.effects.value, detail.effects && Object.keys(detail.effects).length ? formatGoal(detail.effects) : null, true)}
	{/if}
	{@render row($content.detail.error.value, detail.error)}
	{#if node.kind === "action" || node.kind === "understand"}
		<div class="py-2 text-sm">
			<div class="mb-1 text-muted-foreground">{$content.detail.calls.value}</div>
			{#each detail.calls as call, index (index)}
				<div class="flex flex-wrap items-center gap-x-3 font-mono text-xs">
					<span>{call.provider}</span>
					<span class="text-muted-foreground">{call.model}</span>
					<span>{$format.ms(call.latencyMs)}</span>
					{#if call.inputTokens !== null || call.outputTokens !== null}
						<span>{$content.detail.tokens({ input: call.inputTokens ?? 0, output: call.outputTokens ?? 0 })}</span>
					{/if}
					{#if !call.ok}<span class="text-destructive">{call.error ?? "error"}</span>{/if}
				</div>
			{:else}
				<div class="text-xs text-muted-foreground">{$content.detail.noCalls.value}</div>
			{/each}
		</div>
	{/if}
</div>
