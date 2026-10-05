<script lang="ts">
	import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
	import { useIntlayer } from "svelte-intlayer";
	import { Badge } from "$lib/components/ui/badge/index.js";
	import * as Card from "$lib/components/ui/card/index.js";
	import { useFormat } from "$lib/i18n/use-format";
	import { useLiveQuery } from "$lib/live/use-live-query.svelte";
	import NodeDetails from "./node-details.svelte";
	import RequestGraph from "./request-graph.svelte";

	/** One request's own page: what it was, how it ended, its graph (kept current over the live socket) and the node picked in it. */
	let { id }: { id: string } = $props();

	const content = useIntlayer("goap");
	const format = useFormat();

	const live = useLiveQuery("request", () => ({ id }));
	const view = $derived(live.current);
	const request = $derived(view.request);

	const variant = {
		running: "default",
		waiting: "secondary",
		succeeded: "outline",
		failed: "destructive",
		abandoned: "destructive",
	} as const;

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

<div class="grid gap-3">
	<a
		href="/goap"
		class="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
	>
		<ArrowLeftIcon class="size-4" />
		{$content.graph.back.value}
	</a>
	<div>
		<h1 class="text-2xl font-semibold break-words">
			{request.prompt ?? $content.requests.noPrompt.value}
		</h1>
		<div class="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
			<Badge variant={variant[request.status]} class={request.status === "running" ? "animate-pulse" : ""}>
				{$content.requests.status[request.status].value}
			</Badge>
			{#if request.intent}
				<Badge variant="outline">{request.intent}</Badge>
			{/if}
			<span>{$format.date(request.startedAt)}</span>
			<span>·</span>
			<span>{$content.graph.total({ time: $format.ms(request.durationMs) })}</span>
		</div>
	</div>
</div>

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
