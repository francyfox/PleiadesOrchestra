<script lang="ts">
	import { createQuery } from "@tanstack/svelte-query";
	import { useIntlayer } from "svelte-intlayer";
	import DangerZone from "#lib/components/settings/danger-zone.svelte";
	import ProfileCard from "#lib/components/settings/profile-card.svelte";
	import { prefetched } from "#lib/query/prefetch.js";
	import { queries } from "#lib/query/queries.js";

	const me = createQuery(() => queries.me());
	const content = useIntlayer("settings");
</script>

<h1 class="text-2xl font-semibold">{$content.title.value}</h1>

<div class="grid max-w-3xl gap-6">
	<ProfileCard me={prefetched(me)} />
	<DangerZone me={prefetched(me)} />
</div>
