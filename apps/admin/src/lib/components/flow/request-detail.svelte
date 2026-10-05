<script lang="ts">
	import { useIntlayer } from "svelte-intlayer";
	import PageHeader from "$lib/components/page-header.svelte";
	import { Badge } from "$lib/components/ui/badge/index.js";
	import { Button } from "$lib/components/ui/button/index.js";
	import * as Card from "$lib/components/ui/card/index.js";
	import { useFormat } from "$lib/i18n/use-format";
	import { useLiveQuery } from "$lib/live/use-live-query.svelte";
	import NodeDetails from "./node-details.svelte";
	import RequestGraph from "./request-graph.svelte";
	import RequestStatusBadge from "./request-status-badge.svelte";

	/** One request's own page: what it was, how it ended, its graph (kept current over the live socket) and the node picked in it. */
	let { id }: { id: string } = $props();

	const content = useIntlayer("flow");
	const format = useFormat();

	const live = useLiveQuery("request", () => ({ id }));
	const view = $derived(live.current);
	const request = $derived(view.request);
	// The first step that broke the request, if any.
	const failed = $derived(
		view.nodes.find((node) => node.status === "failed") ?? null,
	);

	let picked = $state<string | null>(null);
	// Until a node is picked: the one being worked on, else the result.
	const defaultId = $derived(
		view.nodes.find(
			(node) => node.status === "running" || node.status === "browser",
		)?.id ?? "result",
	);
	const selected = $derived(
		view.nodes.find((node) => node.id === (picked ?? defaultId)) ?? null,
	);
</script>

<PageHeader
	backHref="/flow"
	backLabel={$content.graph.back.value}
	title={request.prompt ?? $content.requests.noPrompt.value}
>
	{#snippet meta()}
		<RequestStatusBadge status={request.status} />
		{#if request.intent}
			<Badge variant="outline">{request.intent}</Badge>
		{/if}
		<span>{$format.date(request.startedAt)}</span>
		<span>·</span>
		<span>{$content.graph.total({ time: $format.ms(request.durationMs) })}</span>
	{/snippet}
</PageHeader>

<Card.Root class={failed || request.status === "abandoned" ? "border-destructive/50" : ""}>
	<Card.Header>
		<Card.Title>{$content.outcome.title.value}</Card.Title>
	</Card.Header>
	<Card.Content class="grid gap-3 text-sm">
		{#if request.reply}
			<p class="whitespace-pre-wrap break-words">{request.reply}</p>
		{:else if request.status === "abandoned"}
			<p class="text-destructive">{$content.outcome.abandoned.value}</p>
		{:else if request.status === "running" || request.status === "waiting"}
			<p class="text-muted-foreground">{$content.outcome.pending.value}</p>
		{:else}
			<p class="text-muted-foreground">{$content.detail.noReply.value}</p>
		{/if}
		{#if failed}
			<div class="flex flex-wrap items-start justify-between gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3">
				<div class="min-w-0">
					<div class="font-medium text-destructive">
						{$content.outcome.failedAt({ step: failed.label || $content.nodeKind[failed.kind].value })}
					</div>
					{#if failed.detail.error}
						<div class="mt-1 font-mono text-xs break-words whitespace-pre-wrap">{failed.detail.error}</div>
					{/if}
				</div>
				<Button size="sm" variant="outline" onclick={() => (picked = failed.id)}>
					{$content.outcome.open.value}
				</Button>
			</div>
		{/if}
	</Card.Content>
</Card.Root>

<div class="grid items-start gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
	<Card.Root>
		<Card.Header>
			<Card.Title>{$content.graph.title.value}</Card.Title>
			<Card.Description>{$content.graph.hint.value}</Card.Description>
		</Card.Header>
		<Card.Content>
			<RequestGraph
				{view}
				selectedId={selected?.id ?? null}
				onSelect={(nodeId) => (picked = nodeId)}
				height="520px"
			/>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>
				{$content.detail.title.value}{selected ? ` — ${selected.label || $content.nodeKind[selected.kind].value}` : ""}
			</Card.Title>
		</Card.Header>
		<Card.Content>
			{#if selected}
				<NodeDetails node={selected} />
			{:else}
				<p class="text-sm text-muted-foreground">{$content.detail.pick.value}</p>
			{/if}
		</Card.Content>
	</Card.Root>
</div>
