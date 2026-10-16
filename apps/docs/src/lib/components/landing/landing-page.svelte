<script lang="ts">
	import LandingAbout from "#lib/components/landing/LandingAbout.svelte";
	import LandingBenefits from "#lib/components/landing/LandingBenefits.svelte";
	import LandingHistory from "#lib/components/landing/LandingHistory.svelte";
	import LandingMcpCompare from "#lib/components/landing/LandingMcpCompare.svelte";
	import LandingPlatforms from "#lib/components/landing/LandingPlatforms.svelte";
	import LandingPricing from "#lib/components/landing/LandingPricing.svelte";
	import LandingSecurity from "#lib/components/landing/LandingSecurity.svelte";
	import LandingVideo from "#lib/components/landing/LandingVideo.svelte";
</script>

<svelte:head>
	<meta name="robots" content="noindex" />
</svelte:head>

<main id="main-content" class="flex flex-col gap-2">
	<LandingVideo />

	<div class="mx-auto grid w-full max-w-7xl grid-cols-1 gap-2 p-2 lg:grid-cols-2">
		<LandingHistory />
		<LandingAbout />
		<LandingMcpCompare />
		<LandingPlatforms />
		<LandingBenefits />
		<LandingSecurity />
		<LandingPricing />
	</div>
</main>
