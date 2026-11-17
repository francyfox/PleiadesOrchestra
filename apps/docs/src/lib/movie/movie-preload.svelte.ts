import { onMount } from "svelte";
import { ASSETS } from "./movie.storyboard.ts";

// Assets are fetched up front so the popups and slides come from the HTTP cache; the music counts as one more.
export function usePreload(audio: () => HTMLAudioElement) {
	let loaded = $state(0);
	const total = ASSETS.length + 1;

	onMount(() => {
		// a failed file counts as loaded: the page must not hang on one 404
		for (const a of ASSETS)
			fetch(a)
				.then((r) => r.blob())
				.catch(() => {})
				.finally(() => loaded++);
		const done = () => loaded++;
		const a = audio();
		if (a.readyState >= 4) done();
		else {
			a.addEventListener("canplaythrough", done, { once: true });
			a.addEventListener("error", done, { once: true });
		}
	});

	return {
		get ready() {
			return loaded >= total;
		},
		get percent() {
			return Math.round((loaded / total) * 100);
		},
	};
}
