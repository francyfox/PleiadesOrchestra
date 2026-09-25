<script lang="ts">
	import { useIntlayer } from "svelte-intlayer";
	import type { AdminUser } from "$lib/api-types";
	import { Badge } from "$lib/components/ui/badge/index.js";

	let { user }: { user: AdminUser } = $props();

	const content = useIntlayer("users");
</script>

<a class="font-medium underline-offset-4 hover:underline" href={`/users/${encodeURIComponent(user.id)}`}>
	{user.displayName ?? user.externalUserId ?? $content.anonymous.value}
</a>
{#if user.kind === "anonymous"}<Badge variant="outline" class="ml-1">anon</Badge>{/if}
{#if user.displayName && user.externalUserId}
	<div class="text-xs text-muted-foreground">{user.externalUserId}</div>
{/if}
