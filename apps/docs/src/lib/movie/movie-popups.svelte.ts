import { onMount } from "svelte";
import { movie } from "./movie.storyboard.ts";

const frameKey = (f: { src: string; span: number[] }) => f.src + f.span[0];

// Frames are real browser popups; when the browser refuses one, playback stops and asks to allow them.
export function useFramePopups(c: {
	stage: () => HTMLElement;
	t: () => number;
	playing: () => boolean;
	pause: () => void;
}) {
	let blocked = $state(false);
	// Probed without a click: a popup opens only if the viewer allowed pop-ups for the site (a click would always let it open).
	let allowed = $state(false);
	const wins = new Map<string, Window>();

	function probe() {
		const w = window.open("", "po-probe", "popup,width=1,height=1");
		w?.close();
		allowed = !!w;
	}

	function sync() {
		const want = c.playing()
			? movie.framesAt(c.t()).filter((f) => f.mode === "window")
			: [];
		for (const [k, w] of wins)
			if (!want.some((f) => frameKey(f) === k)) {
				w.close();
				wins.delete(k);
			}
		const r = c.stage().getBoundingClientRect();
		const chrome = window.outerHeight - window.innerHeight; // toolbar height
		for (const f of want) {
			if (wins.has(frameKey(f))) continue; // a window the viewer closed stays closed
			const { x, y, w, h } = f.box;
			const features = `popup,width=${Math.round((w * r.width) / 100)},height=${Math.round((h * r.height) / 100)},left=${Math.round(window.screenX + r.left + (x * r.width) / 100)},top=${Math.round(window.screenY + chrome + r.top + (y * r.height) / 100)}`;
			const opened = window.open(
				`/movie/frame.html?src=${f.src}`,
				frameKey(f),
				features,
			);
			if (opened) wins.set(frameKey(f), opened);
			else {
				c.pause();
				blocked = true;
				break;
			}
		}
	}

	$effect(sync);

	onMount(() => {
		probe();
		const id = setInterval(() => allowed || probe(), 1500);
		return () => {
			clearInterval(id);
			for (const w of wins.values()) w.close();
		};
	});

	return {
		get blocked() {
			return blocked;
		},
		get allowed() {
			return allowed;
		},
		clearBlocked: () => (blocked = false),
	};
}
