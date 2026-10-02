<script lang="ts">
	import { useIntlayer } from "svelte-intlayer";
	import * as Card from "$lib/components/ui/card/index.js";
	import { useFormat } from "$lib/i18n/use-format";
	import { useLiveQuery } from "$lib/live/use-live-query.svelte";
	import NodeDetails from "./node-details.svelte";
	import RequestGraph from "./request-graph.svelte";

	/** The graph of one request, kept current over the live socket, and the details of the node picked in it. */
	let { id }: { id: string } = $props();

	const content = useIntlayer("goap");
	const format = useFormat();

	const live = useLiveQuery("request", () => ({ id }));
	const view = $derived(live.current);

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

<Card.Root>
	<Card.Header>
		<Card.Title>{$content.graph.title.value}</Card.Title>
		<Card.Description>
			{view.request.prompt ?? ""} · {$content.graph.total({ time: $format.ms(view.request.durationMs) })}
		</Card.Description>
	</Card.Header>
	<Card.Content class="flex flex-col gap-4">
		<p class="text-sm text-muted-foreground">{$content.graph.hint.value}</p>
		<RequestGraph {view} selectedId={selected?.id ?? null} onSelect={(nodeId) => (picked = nodeId)} />
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
