<script lang="ts">
	import "#lib/pleiades-site.css";
	import LandingAbout from "#lib/components/landing/LandingAbout.svelte";
	import LandingBenefits from "#lib/components/landing/LandingBenefits.svelte";
	import LandingFlow from "#lib/components/landing/LandingFlow.svelte";
	import LandingFlowResults from "#lib/components/landing/LandingFlowResults.svelte";
	import LandingHistory from "#lib/components/landing/LandingHistory.svelte";
	import LandingMcpCompare from "#lib/components/landing/LandingMcpCompare.svelte";
	import LandingNav from "#lib/components/landing/LandingNav.svelte";
	import LandingPlatforms from "#lib/components/landing/LandingPlatforms.svelte";
	import LandingPleiades from "#lib/components/landing/LandingPleiades.svelte";
	import LandingPricing from "#lib/components/landing/LandingPricing.svelte";
	import LandingSecurity from "#lib/components/landing/LandingSecurity.svelte";
	import LandingTvGallery from "#lib/components/landing/LandingTvGallery.svelte";
	import LandingVideo from "#lib/components/landing/LandingVideo.svelte";
</script>

<svelte:head>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="po-site">
<LandingNav />
<div id="main-content" class="flex flex-col gap-2">
	<LandingVideo />
	<LandingHistory />
	<LandingAbout />
	<LandingFlow />
	<LandingFlowResults />
	<LandingTvGallery />
	<LandingBenefits />
	<LandingPlatforms />
	<LandingSecurity />
	<LandingPricing />
	<LandingPleiades />
</div>
</div>

<style>
	/* Anchored sections land below the header and the LandingNav row. */
	.po-site :global([id]) {
		scroll-margin-top: calc(var(--po-nav) + var(--po-landing-nav));
	}
</style>
