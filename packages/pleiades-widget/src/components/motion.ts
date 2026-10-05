/**
 * All movement of the widget, on the browser's own Web Animations API. The
 * markup is drawn by Alpine; this file only moves what is already there. With
 * `prefers-reduced-motion` nothing moves at all — elements just appear.
 */

export const reduced = () =>
	typeof matchMedia === "function" &&
	matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Easing curves, as CSS timing functions. */
export const ease = {
	outBack: "cubic-bezier(0.34, 1.56, 0.64, 1)",
	outCubic: "cubic-bezier(0.215, 0.61, 0.355, 1)",
	inCubic: "cubic-bezier(0.55, 0.055, 0.675, 0.19)",
	outQuad: "cubic-bezier(0.25, 0.46, 0.45, 0.94)",
	inOutSine: "cubic-bezier(0.37, 0, 0.63, 1)",
} as const;

const running = new WeakMap<Element, Animation>();

/** Starts `keyframes` on `el`, replacing whatever still runs on it. */
export function play(
	el: HTMLElement,
	keyframes: Keyframe[],
	options: KeyframeAnimationOptions,
): Animation | undefined {
	running.get(el)?.cancel();
	if (reduced() || typeof el.animate !== "function") return undefined;
	const animation = el.animate(keyframes, options);
	running.set(el, animation);
	return animation;
}
