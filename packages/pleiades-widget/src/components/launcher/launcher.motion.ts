import { ease, play } from "../motion.ts";

/** The launcher pops back in once the panel has slid away. */
export function popIn(launcher: HTMLElement): void {
	play(
		launcher,
		[
			{ transform: "scale(0.6)", opacity: 0 },
			{ transform: "scale(1)", opacity: 1 },
		],
		{ duration: 220, easing: ease.outBack },
	);
}
