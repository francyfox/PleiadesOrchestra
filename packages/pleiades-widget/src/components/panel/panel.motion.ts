import { popIn } from "../launcher/launcher.motion.ts";
import { ease, play } from "../motion.ts";

export type Side = "left" | "right";

const offscreen = (side: Side) => (side === "left" ? "-100%" : "100%");

/**
 * Opens or closes the side panel. Opening is visible and focusable at once
 * (the slide runs on top of that); closing slides out and only then hides the
 * panel and brings the launcher back, so a closed panel can never take focus.
 */
export function movePanel(
	widget: HTMLElement,
	panel: HTMLElement,
	launcher: HTMLElement,
	side: Side,
	open: boolean,
): void {
	if (open) {
		widget.classList.add("open");
		panel.classList.add("open");
		panel.inert = false;
		play(
			panel,
			[
				{ transform: `translateX(${offscreen(side)})`, opacity: 0 },
				{ transform: "translateX(0%)", opacity: 1 },
			],
			{ duration: 220, easing: ease.outCubic },
		);
		return;
	}
	const hide = () => {
		slide?.cancel();
		panel.classList.remove("open");
		panel.inert = true;
		widget.classList.remove("open");
		// Back where the visitor started from (the launcher is shown again just above).
		launcher.focus();
		popIn(launcher);
	};
	// Not yet open (the first render of a closed widget): nothing to slide.
	if (!panel.classList.contains("open")) return;
	// Held at its last frame until `hide` runs, so it can't flash back open.
	const slide = play(
		panel,
		[
			{ transform: "translateX(0%)", opacity: 1 },
			{ transform: `translateX(${offscreen(side)})`, opacity: 0 },
		],
		{ duration: 180, easing: ease.inCubic, fill: "forwards" },
	);
	if (slide) slide.onfinish = hide;
	else hide();
}
