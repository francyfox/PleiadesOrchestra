<script lang="ts">
	import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
	import { useIntlayer } from "svelte-intlayer";
	import { Badge } from "$lib/components/ui/badge/index.js";
	import { useFormat } from "$lib/i18n/use-format";
	import { useLiveQuery } from "$lib/live/use-live-query.svelte";
	import McpToolsTable from "./mcp-tools-table.svelte";

	/** One site's own page: its newest WebMCP catalog and when it was announced, kept current over the live socket. */
	let { id }: { id: string } = $props();

	const content = useIntlayer("mcp");
	const format = useFormat();

	const live = useLiveQuery("mcp", () => ({}));
	// A site that vanished from the list (its channel was removed) keeps the last known data on screen.
	let last = $state<(typeof live.current.items)[number] | null>(null);
	const found = $derived(
		live.current.items.find((site) => site.channelId === id),
	);
	$effect(() => {
		if (found) last = found;
	});
	const site = $derived(found ?? last);
</script>

<div class="grid gap-3">
	<a
		href="/mcp"
		class="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
	>
		<ArrowLeftIcon class="size-4" />
		{$content.back.value}
	</a>
	{#if site}
		<div>
			<h1 class="text-2xl font-semibold">{site.channelName}</h1>
			<div class="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
				<Badge variant="outline">{site.channelSlug}</Badge>
				<span>{$content.detail.tools({ count: site.toolCount })}</span>
				<span>·</span>
				<span>{$content.detail.versions({ count: site.versions })}</span>
				<span>·</span>
				<span>{$content.detail.lastSeen({ time: $format.date(site.lastSeenAt) })}</span>
			</div>
		</div>
		<McpToolsTable tools={site.tools} />
	{/if}
</div>
