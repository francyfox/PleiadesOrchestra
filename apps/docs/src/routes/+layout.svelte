<script lang="ts">
	import "#lib/site-header.css";
	import type { Snippet } from "svelte";

	let { children }: { children: Snippet } = $props();
</script>

{@render children()}

<footer class="site-footer">
	<!-- Sveltia CMS (static/admin): a static page, not a SvelteKit route. -->
	<a href="/admin/" data-sveltekit-reload>Admin</a>
</footer>

<style>
	.site-footer {
		display: flex;
		justify-content: center;
		padding: 1.5rem 1rem;
		font-size: 0.8rem;
		opacity: 0.7;
	}
</style>
