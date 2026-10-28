<script lang="ts">
	import { useIntlayer } from "svelte-intlayer";
	import type { RequestNode } from "#lib/api-types.js";
	import { Badge } from "#lib/components/ui/badge/index.js";
	import { formatGoal } from "#lib/goap-facts.js";
	import { useFormat } from "#lib/i18n/use-format.js";
	import { sortedOptions } from "#lib/request-graph.js";

	/** Everything the BFF knows about one node: arguments, the tool's answer, effects, model calls. */
	let { node }: { node: RequestNode } = $props();

	const content = useIntlayer("flow");
	const format = useFormat();

	type Status = keyof typeof $content.nodeStatus;
	const detail = $derived(node.detail);
	const args = $derived(
		detail.toolArgs ? JSON.stringify(detail.toolArgs, null, 2) : null,
	);
	/** The prompt is stored as JSON messages; anything else is shown as it is. */
	const promptText = (prompt: string): string => {
		try {
			const messages = JSON.parse(prompt) as {
				role: string;
				content: string;
			}[];
			return messages.map((m) => `[${m.role}]\n${m.content}`).join("\n\n");
		} catch {
			return prompt;
		}
	};
	/** What the decision model read: one line per field of an object state. */
	const stateLines = (state: unknown): [string, unknown][] =>
		state === undefined || state === null
			? []
			: typeof state === "object" && !Array.isArray(state)
				? Object.entries(state)
				: [["", state]];
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
	{#if detail.changes?.length}
		{@render row($content.detail.changes.value, detail.changes.map((c) => `${c.key}: ${c.before === null ? "∅" : String(c.before)} → ${String(c.after)}`).join("\n"), true)}
	{/if}
	{#if detail.plan}
		{@render row(
			$content.detail.plan.value,
			`${detail.plan.steps.map((s) => s.name).join(" → ")}\n${$content.detail.planCost({ cost: detail.plan.totalCost })}`,
			true,
		)}
		{@render row($content.detail.alternatives.value, detail.plan.alternatives.map((a) => `${a.name} (${a.cost}): ${a.why}`).join("\n"), true)}
	{/if}
	{@render row($content.detail.error.value, detail.error)}
	{#if detail.understood}
		{@render row($content.detail.english.value, detail.understood.en)}
		<div class="py-2 text-sm">
			<div class="mb-1 text-muted-foreground">{$content.detail.tasks.value}</div>
			{#each detail.understood.tasks as task, index (index)}
				<div class="mb-2 text-xs">
					<div><span class="font-mono font-medium">{task.intent}</span> · {task.text}</div>
					<div class="font-mono text-muted-foreground">
						{task.items.length ? task.items.map((item) => `${item.quantity} × ${item.name}`).join(", ") : $content.detail.noItems.value}
					</div>
					{#if task.attributes.length}
						<div class="font-mono text-muted-foreground">{task.attributes.map((a) => `${a.name} = ${a.value}`).join(", ")}</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
	{#each detail.calls.flatMap((call) => call.choices ?? []) as choice, index (index)}
		<div class="py-2 text-sm">
			<div class="mb-1 text-muted-foreground">{choice.question}{choice.round ? ` · ${choice.round}` : ""}</div>
			{#if choice.instructions}
				<div class="mb-1 text-xs whitespace-pre-wrap break-words">{choice.instructions}</div>
			{/if}
			{#each stateLines(choice.state) as [key, value] (key)}
				<div class="mb-1 font-mono text-xs whitespace-pre-wrap break-words">{#if key}<span class="text-muted-foreground">{key}:</span> {/if}{typeof value === "string" ? value : JSON.stringify(value)}</div>
			{/each}
			<table class="w-full text-xs">
				<tbody>
					{#each sortedOptions(choice) as [option, probability] (option)}
						<tr class={option === choice.chosen ? "font-medium" : "text-muted-foreground"}>
							<td class="break-all py-0.5 pr-2 font-mono">
								{option === "not_said" ? $content.choices.notSaid.value : option}
								{#if choice.criteria?.[option] && choice.criteria[option] !== option}
									<div class="font-sans text-muted-foreground">{choice.criteria[option]}</div>
								{/if}
							</td>
							<td class="w-14 py-0.5 text-right font-mono tabular-nums">{$format.percent(probability)}</td>
							<td class="w-20 py-0.5 pl-2">
								{#if option === choice.chosen}<Badge variant="secondary">{$content.choices.chosen.value}</Badge>{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/each}
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
					{#if call.attempts && call.attempts > 1}
						<span class="text-destructive">{$content.detail.attempts({ count: call.attempts, failed: (call.failedStatuses ?? []).map((s) => s || "—").join(", ") })}</span>
					{/if}
					{#if !call.ok}<span class="text-destructive">{call.error ?? "error"}</span>{/if}
				</div>
				{#if call.prompt}
					<details class="mt-1 text-xs">
						<summary class="cursor-pointer text-muted-foreground">{$content.detail.prompt.value}</summary>
						<pre class="mt-1 max-h-72 overflow-auto rounded bg-muted p-2 font-mono whitespace-pre-wrap break-words">{promptText(call.prompt)}</pre>
					</details>
				{/if}
				{#if call.response}
					<details class="mt-1 mb-2 text-xs">
						<summary class="cursor-pointer text-muted-foreground">{$content.detail.response.value}</summary>
						<pre class="mt-1 max-h-72 overflow-auto rounded bg-muted p-2 font-mono whitespace-pre-wrap break-words">{call.response}</pre>
					</details>
				{/if}
			{:else}
				<div class="text-xs text-muted-foreground">{$content.detail.noCalls.value}</div>
			{/each}
		</div>
	{/if}
</div>
