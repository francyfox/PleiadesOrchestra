// Isometric title press for the intro (built with the Anatomy skill's kit, see ./iso/iso-kit.ts).
// A carriage rides a rear beam, slides over three trays and stamps a logo on each.
import * as k from "./iso/iso-kit.ts";
import { END_X, TRAY_X } from "./splash-pose.ts";

export const W = 640;
export const H = 360;
export const LOGOS = ["/logo.svg", "/movie/elysia.svg", "/movie/svelte.svg"];
const LOGO = 50;
const TRAY_Z = 4;

const DUMMY_X = END_X; // a blank tray after the last logo: the head ends over it
// plate spans x = -150 .. the blank tray (half width 38) plus an 8 margin
const PLATE = { x: -150, y: -58, w: 150 + DUMMY_X + 46, d: 116, r: 8 };
const PLATE_H = 12;
const FOOT_H = 5;
const BEAM = { x: -146, y: -54, w: 292, d: 10, r: 2 };
const BEAM_Z = 46;
const POSTS = [-140, 140];
const PAD_Z = 12; // stamp plate at rest, travels down by `dip`
const PAD = { x: -38, y: -34, w: 76, d: 68, r: 3 }; // same footprint as a tray (see tray())

export const P = k.fitProjection(
	[
		...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0),
		[POSTS[0] as number, -49, 80],
		[POSTS[1] as number, -49, 80],
		[0, 40, 76],
	],
	W,
	H,
	{ pad: 22, azimuth: 42 },
);

const S = (paths: k.SolidPaths, style?: k.SolidStyle) =>
	k.solidSvg(paths, style);
const L = (d: string, style?: k.LineStyle) => k.lineSvg(d, style);
const at = (p: k.Point3) => k.iso(p, P);

function post(x: number) {
	const y = -49;
	return [
		S(k.cylinder(x, y, 9, 0, 3, P, 32), { tone: "mid" }),
		k.dotsSvg(
			[
				[x - 6, y + 3.5],
				[x + 6, y - 3.5],
			].map(([a, b]) => at([a as number, b as number, 3])),
			{ size: 0.45 },
		),
		S(k.cylinder(x, y, 4.6, 3, BEAM_Z - 3, P, 28), {
			tone: "mid",
			crease: "none",
		}),
		L(k.sideArc(x, y, 4.6, 20, P, 12), { tone: "faint" }),
		L(k.sideArc(x, y, 4.6, 34, P, 12), { tone: "faint" }),
		S(k.cylinder(x, y, 5.6, BEAM_Z + 8, 3, P, 28), { tone: "mid" }),
	].join("");
}

function beam() {
	const out = [S(k.slabOf(BEAM, BEAM_Z, 8, P, 3, 0.6), { tone: "mid" })];
	const ticks = k.topTicks(
		BEAM.x + 8,
		BEAM.x + BEAM.w - 8,
		4,
		5,
		BEAM.y + 1.2,
		BEAM_Z + 8,
		[1.8, 3.2],
		P,
	);
	out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
	out.push(
		L(
			k.lineOnTop(
				[BEAM.x + 4, BEAM.y + BEAM.d - 1.5],
				[BEAM.x + BEAM.w - 4, BEAM.y + BEAM.d - 1.5],
				BEAM_Z + 8,
				P,
			),
			{ tone: "faint" },
		),
	);
	out.push(
		k.dotsSvg(
			[BEAM.x + 3, BEAM.x + BEAM.w - 3].map((x) =>
				at([x, BEAM.y + 5, BEAM_Z + 8]),
			),
			{ size: 0.45 },
		),
	);
	return out.join("");
}

function tray(cx: number) {
	const plan = { x: cx - 38, y: -34, w: 76, d: 68, r: 4 };
	const out = [S(k.slabOf(plan, 0, TRAY_Z, P, 4, 0.5), { tone: "mid" })];
	out.push(
		L(k.planOutline(k.insetPlan(plan, 3), TRAY_Z, P, 4), { tone: "faint" }),
	);
	const screws = k.corners(plan, 6);
	out.push(
		k.dotsSvg(
			screws.map(([x, y]) => at([x, y, TRAY_Z])),
			{ size: 0.45 },
		),
	);
	return out.join("");
}

// the logo lies flat on its tray; opacity is set by the pose (blank until stamped)
export const logoTransform = (i: number) =>
	k.topMatrix([(TRAY_X[i] as number) - LOGO / 2, -LOGO / 2], TRAY_Z + 0.1, P);
export const LOGO_SIZE = LOGO;

export const back = [
	post(POSTS[0] as number),
	beam(),
	...[...TRAY_X, DUMMY_X].map(tray),
].join("");
export const frontPost = post(POSTS[1] as number);

// Carriage, built at x = 0 and moved with translateAlong.
export const carriage = (() => {
	const out = [
		`<path class="iso-halo" d="${k.haloOf({ x: -14, y: -50, w: 28, d: 10, r: 2 }, BEAM_Z, 0.1, P)}" style="filter:blur(3px)"/>`,
		S(k.slabOf({ x: -16, y: -57, w: 32, d: 18, r: 3 }, 42, 18, P, 4, 0.6), {
			tone: "mid",
		}),
		L(
			k.planOutline(
				k.insetPlan({ x: -16, y: -57, w: 32, d: 18, r: 3 }, 3),
				60,
				P,
				4,
			),
			{ tone: "faint" },
		),
		k.dotsSvg(
			[-10, 10].map((x) => at([x, -54, 60])),
			{ size: 0.45 },
		),
		S(k.slabOf({ x: -6, y: -40, w: 12, d: 44, r: 2 }, 52, 6, P, 3, 0.5), {
			tone: "mid",
		}),
		k.dotsSvg([at([0, -36, 58]), at([0, 6, 58])], { size: 0.45 }),
		S(k.cylinder(0, 0, 9, 44, 8, P, 32), { tone: "mid" }),
		L(k.sideArc(0, 0, 9, 48, P, 16), { tone: "faint" }),
	];
	return out.join("");
})();

// Lower stamp: rod and plate at rest, moved down by `dip`. The rod ends inside the collar, which covers it.
export const stamp = (() => {
	const lamp = { tone: "hi", lit: true } as const;
	return [
		S(k.cylinder(0, 0, 3, PAD_Z + 3, 41, P, 20), {
			crease: "none",
			...lamp,
		}),
		S(k.slabOf(PAD, PAD_Z, 3, P, 3, 0.5), lamp),
		L(k.planOutline(k.insetPlan(PAD, 3), PAD_Z + 3, P, 3), { tone: "lit" }),
	].join("");
})();

// Upper stamp, above the arm: the cap sinks by `dip` and the rod shortens with it.
export const upper = (dip: number) =>
	[
		S(k.cylinder(0, 0, 3, 58, 14 - dip, P, 20), {
			tone: "hi",
			crease: "none",
			lit: true,
		}),
		S(k.cylinder(0, 0, 5, 72 - dip, 3, P, 24), { tone: "mid" }),
		L(k.knurl(0, 0, 5, 72 - dip, 75 - dip, 18, P), { tone: "lo" }),
	].join("");

// Screen point where the stamp plate's top is (`dip` = how far it has gone down): the camera sits there.
export const plateAt = (x: number, dip = 0) => at([x, 0, PAD_Z + 3 - dip]);
export const LAMPS = [-136, -126, -116].map((x) => at([x, 47, 0.8]));
export const label =
	"An isometric title press. A carriage rides a beam and slides over three trays, stamping the shalotts, Elysia and Svelte logos in turn.";
