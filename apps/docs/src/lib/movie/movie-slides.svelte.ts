import Splide from "@splidejs/splide";
import { onMount } from "svelte";

// Fade slider of the scene backgrounds; follows the scene index.
export function useSlides(root: () => HTMLElement, scene: () => number) {
	let splide = $state.raw<Splide>();

	onMount(() => {
		splide = new Splide(root(), {
			type: "fade",
			arrows: false,
			pagination: false,
			drag: false,
			keyboard: false,
			speed: 1200,
		}).mount();
		return () => splide?.destroy();
	});

	$effect(() => {
		if (scene() >= 0) splide?.go(scene());
	});
}
