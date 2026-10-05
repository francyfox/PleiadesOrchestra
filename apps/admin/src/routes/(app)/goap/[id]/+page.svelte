<script lang="ts">
	import RequestDetail from "$lib/components/goap/request-detail.svelte";

	let { data } = $props();
</script>

{#key data.id}
	<RequestDetail id={data.id} />
{/key}
