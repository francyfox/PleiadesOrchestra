import { ease, play, reduced } from "../motion.ts";

const entered = new WeakSet<Element>();
const dots = new Map<Element, Animation[]>();

/**
 * After every update of the conversation: bubbles and flow lines that just
 * appeared fade in, the typing dots of a waiting reply bounce, and the dots of
 * a reply that has begun (or whose bubble is gone) stop.
 */
export function animateConversation(container: ParentNode): void {
	for (const [el, animations] of dots) {
		if (!el.isConnected || !el.closest(".typing")) {
			for (const animation of animations) animation.cancel();
			dots.delete(el);
		}
	}
	for (const bubble of container.querySelectorAll<HTMLElement>(
		".message[data-id]",
	)) {
		if (entered.has(bubble)) continue;
		entered.add(bubble);
		play(
			bubble,
			[
				{ opacity: 0, transform: "translateY(10px)" },
				{ opacity: 1, transform: "translateY(0)" },
			],
			{ duration: 220, easing: ease.outQuad },
		);
	}
	for (const step of container.querySelectorAll<HTMLElement>(".step")) {
		if (entered.has(step)) continue;
		entered.add(step);
		play(
			step,
			[
				{ opacity: 0, transform: "translateX(-6px)" },
				{ opacity: 1, transform: "translateX(0)" },
			],
			{ duration: 160, easing: ease.outQuad },
		);
	}
	if (reduced()) return;
	for (const group of container.querySelectorAll<HTMLElement>(
		".typing .dots",
	)) {
		if (dots.has(group)) continue;
		if (typeof group.animate !== "function") continue;
		const animations = [...group.querySelectorAll<HTMLElement>("i")].map(
			(dot, index) =>
				dot.animate(
					[
						{ transform: "translateY(0)" },
						{ transform: "translateY(-4px)" },
						{ transform: "translateY(0)" },
					],
					{
						duration: 700,
						delay: index * 120,
						iterations: Number.POSITIVE_INFINITY,
						easing: ease.inOutSine,
					},
				),
		);
		dots.set(group, animations);
	}
}
