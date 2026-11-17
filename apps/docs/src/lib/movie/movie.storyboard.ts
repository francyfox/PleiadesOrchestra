import { type Box, MovieWizard, Scene } from "./movie-wizard.ts";
import { INTRO_LENGTH } from "./splash-pose.ts";

// The track is 123 bpm (setcpm(123/4) in 4toTheFloor/output/track_real.strudel.js): a bar is 4*60/123 s,
// so every cut is a whole number of bars after the music starts at MUSIC_AT (the 60 s clip is ~30.7 bars).
export const MUSIC_AT = +INTRO_LENGTH.toFixed(2);
export const INTRO_END = MUSIC_AT;
const BAR = 240 / 123;
const bar = (n: number) => +(MUSIC_AT + n * BAR).toFixed(2);
// the lower-third title leaves with the first photo scene
export const CAPTION_END = bar(3);
export const CREDITS_AT = bar(30);
export const CREDITS_LENGTH = 18; // seconds of scroll

const m = (name: string) => `/movie/${name}.m2a`;
const photo = (i: number) => `/movie/photo${i}.m2a`;
// Everything the player downloads before PLAY (the music is tracked by the <audio> element itself).
export const ASSETS = [
	...Array.from({ length: 14 }, (_, i) => photo(i)),
	...[
		"01_drums",
		"02_guitar",
		"03_dance",
		"04_dance",
		"05_dance",
		"07_dance",
		"08_dance",
		"09_dance",
	].map(m),
];
// Frame windows: wide (16:9 video) and tall (800x1080 video), percent of the stage.
const wide = (x: number, y: number, w = 38): Box => ({ x, y, w, h: w * 0.75 });
const tall = (x: number, y: number, w = 24): Box => ({ x, y, w, h: w * 1.8 });
// Class names are Ken Burns moves, see MoviePlayer.svelte.
const pan =
	(src: string, className: string) =>
	({ set }: { set: (l: { src: string; className: string }) => void }) =>
		set({ src, className });

// 05_dance is 21.2 s (11 bars): its window opens at bar 19 so it plays to the end before the credits.
export const movie = new MovieWizard()
	.add(new Scene([0, MUSIC_AT], ({ set }) => set({})))
	.add(
		new Scene([bar(0), bar(3)], pan(photo(0), "kb-in-left")).addFrame(
			[bar(1), bar(3)],
			({ m2aLoad }) => m2aLoad(m("01_drums"), wide(50, 12, 45)),
		),
	)
	.add(
		new Scene([bar(3), bar(5)], pan(photo(1), "kb-in-right"))
			.addFrame([bar(3), bar(7)], ({ m2aLoad }) =>
				m2aLoad(m("02_guitar"), tall(60, 20, 30)),
			)
			.addFrame([bar(5), bar(7)], ({ m2aLoad }) =>
				m2aLoad(m("04_dance"), tall(20, 40, 26)),
			),
	)
	.add(new Scene([bar(5), bar(7)], pan(photo(2), "kb-up")))
	.add(
		new Scene([bar(7), bar(9)], pan(photo(3), "kb-up"))
			.addFrame([bar(7), bar(11)], ({ m2aLoad }) =>
				m2aLoad(m("07_dance"), wide(20, 40, 80)), { mode: "div" },
			)
	)
	.add(new Scene([bar(9), bar(11)], pan(photo(4), "kb-in-left")))
	.add(
		new Scene([bar(11), bar(13)], pan(photo(5), "kb-in-left"))
			.addFrame([bar(11), bar(15)], ({ m2aLoad }) =>
				m2aLoad(m("08_dance"), wide(20, 40, 40)), { mode: "div" },
			)
	)
	.add(new Scene([bar(13), bar(15)], pan(photo(6), "kb-in-right")))
	.add(
		new Scene([bar(15), bar(17)], pan(photo(7), "kb-in-right"))
			.addFrame([bar(15), bar(19)], ({ m2aLoad }) =>
				m2aLoad(m("03_dance"), tall(8, 8)),
			)
			.addFrame([bar(16), bar(19)], ({ m2aLoad }) =>
				m2aLoad(m("04_dance"), tall(40, 14)),
			)
			.addFrame([bar(17), bar(19)], ({ m2aLoad }) =>
				m2aLoad(m("01_drums"), wide(62, 56, 32)),
			),
	)
	.add(new Scene([bar(17), bar(19)], pan(photo(8), "kb-up")))
	.add(
		new Scene([bar(19), bar(21)], pan(photo(9), "kb-up")).addFrame(
			[bar(19), CREDITS_AT],
			({ m2aLoad }) => m2aLoad(m("05_dance"), wide(0, 40, 100)), { mode: 'div' },
		),
	)
	.add(
		new Scene([bar(21), bar(23)], pan(photo(10), "kb-in-left")).addFrame(
			[bar(21), bar(23)],
			({ m2aLoad }) => m2aLoad(m("07_dance"), wide(10, 20, 60)),
			{ mode: "div" },
		),
	)
	.add(
		new Scene([bar(23), bar(25)], pan(photo(11), "kb-in-right")).addFrame(
			[bar(23), bar(25)],
			({ m2aLoad }) => {},
			{ mode: "div" },
		),
	)
	.add(
		new Scene([bar(25), bar(27)], pan(photo(12), "kb-up")).addFrame(
			[bar(25), bar(27)],
			({ m2aLoad }) => m2aLoad(m("09_dance"), wide(15, 12, 60)),
		),
	)
	.add(new Scene([bar(27), CREDITS_AT], pan(photo(13), "kb-in-left")))
	.add(
		new Scene([CREDITS_AT, CREDITS_AT + CREDITS_LENGTH + 1], ({ set }) =>
			set({}),
		),
	);
