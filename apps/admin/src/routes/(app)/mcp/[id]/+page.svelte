<script lang="ts">
	import McpSiteDetail from "$lib/components/mcp/mcp-site-detail.svelte";

	let { data } = $props();
</script>

{#key data.id}
	<McpSiteDetail id={data.id} />
{/key}
