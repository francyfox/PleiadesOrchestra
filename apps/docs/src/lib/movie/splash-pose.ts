// Timeline of the intro press: a carriage visits three trays and stamps a logo on each,
// then slides on to a blank tray and stays there.
// Pure and a function of the clock only, so seeking the movie lands on the right frame.
export const TRAY_X = [-96, 0, 96];
export const END_X = (TRAY_X.at(-1) as number) + 96; // the blank tray, where the head stops
// Every time below was written for a 6 s intro; SPEED plays it that much faster.
const SPEED = 1.5;
const s = (seconds: number) => seconds / SPEED;
// Moments the stamp touches the tray, seconds: one inside each of the splash's three cards.
export const STAMP_AT = [1.1, 3.3, 5.1].map(s);
export const CARD_AT = [2.2, 4.2].map(s); // the card changes here
export const PRESS = 8; // stroke of the head, world units
const HALF = s(0.25); // seconds down, same up
const START_X = -140;
const LAST = STAMP_AT.at(-1) as number;
const LEAVE = LAST + HALF + s(0.2); // the head leaves the last logo...
const ARRIVE = LEAVE + s(0.65); // ...and is over the blank tray
export const INTRO_LENGTH = ARRIVE + 0.4; // the movie's music starts when the intro ends

const smooth = (a: number, b: number, t: number) => {
	const u = Math.min(1, Math.max(0, (t - a) / (b - a)));
	return u * u * (3 - 2 * u);
};

export function poseAt(t: number) {
	// slide to a tray, then wait 0.5 s before the stamp lands
	let x = START_X + (TRAY_X[0] - START_X) * smooth(0, s(0.6), t);
	for (let i = 1; i < TRAY_X.length; i++)
		x +=
			(TRAY_X[i] - TRAY_X[i - 1]) *
			smooth(STAMP_AT[i - 1] + HALF + s(0.2), STAMP_AT[i] - s(0.7), t);
	x += (END_X - (TRAY_X.at(-1) as number)) * smooth(LEAVE, ARRIVE, t);
	const dip = STAMP_AT.reduce((best, st) => {
		const u = (t - (st - HALF)) / (2 * HALF);
		return u > 0 && u < 1
			? Math.max(best, PRESS * Math.sin(Math.PI * u) ** 2)
			: best;
	}, 0);
	// ink: 0.18 while the tray is blank, 1 once the stamp has landed
	const inked = STAMP_AT.map((st) => 0.18 + 0.82 * smooth(st, st + s(0.2), t));
	return { x, dip, inked };
}

export type Cue = { at: number; kind: "slide" | "stamp"; length: number };
// What the splash sounds like: the head slides (noise sweep) and stamps (thud).
export const CUES: Cue[] = [
	{ at: 0, kind: "slide", length: s(0.6) },
	{ at: STAMP_AT[0] as number, kind: "stamp", length: 0.3 },
	{
		at: (STAMP_AT[0] as number) + HALF + s(0.2),
		kind: "slide",
		length: s(1.05),
	},
	{ at: STAMP_AT[1] as number, kind: "stamp", length: 0.3 },
	{
		at: (STAMP_AT[1] as number) + HALF + s(0.2),
		kind: "slide",
		length: s(0.65),
	},
	{ at: STAMP_AT[2] as number, kind: "stamp", length: 0.3 },
	{ at: LEAVE, kind: "slide", length: s(0.65) },
];

// Cues that start in (from, to]. A jump longer than a frame or two is a seek, not playback: no sound.
export const cuesBetween = (from: number, to: number) =>
	to - from > 0.5 || to < from
		? []
		: CUES.filter((c) => c.at > from && c.at <= to);
