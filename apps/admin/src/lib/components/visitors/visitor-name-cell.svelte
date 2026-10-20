<script lang="ts">
	import { useIntlayer } from "svelte-intlayer";
	import type { Visitor } from "#lib/api-types.js";
	import CopyValue from "#lib/components/copy-value.svelte";
	import { Badge } from "#lib/components/ui/badge/index.js";

	let { visitor }: { visitor: Visitor } = $props();

	const content = useIntlayer("visitors");
</script>

<a class="font-medium underline-offset-4 hover:underline" href={`/visitors/${encodeURIComponent(visitor.id)}`}>
	{visitor.name}
</a>
{#if visitor.kind === "anonymous"}<Badge variant="outline" class="ml-1">{$content.anonymous.value}</Badge>{/if}
{#if visitor.displayName}
	<div class="text-xs text-muted-foreground">{visitor.displayName}{visitor.externalUserId ? ` · ${visitor.externalUserId}` : ""}</div>
{/if}
<div><CopyValue value={visitor.id} label={$content.copyId.value} /></div>
