<script lang="ts">
	import RequestDetail from "$lib/components/flow/request-detail.svelte";

	let { data } = $props();
</script>

{#key data.id}
	<RequestDetail id={data.id} />
{/key}
