// Timeline of the /movie/ page: scenes with a background image and browser-window frames
// that play an .m2a video between two timestamps (seconds). Pure, no DOM.
export type Span = [start: number, end: number];
export type Box = { x: number; y: number; w: number; h: number }; // percent of the 4:3 stage
// window: a real browser popup; div: an absolutely positioned block inside the stage (recordable, never blocked)
export type FrameMode = "window" | "div";
// div only: CSS background of the block and its transform (e.g. "perspective(800px) rotateY(-20deg)")
export type FrameOptions = {
	mode?: FrameMode;
	background?: string;
	transform?: string;
};
export type FrameSpec = FrameOptions & {
	span: Span;
	src: string;
	box: Box;
	title: string;
	mode: FrameMode;
};
export type SceneLook = { src?: string; className?: string };

const inSpan = ([a, b]: Span, t: number) => t >= a && t < b;

export class Scene {
	look: SceneLook = {};
	frames: FrameSpec[] = [];
	constructor(
		readonly span: Span,
		setup: (api: { set: (look: SceneLook) => void }) => void,
	) {
		setup({ set: (look) => (this.look = look) });
	}
	// `load` gets `m2aLoad(src, box)`: the frame's video and where its window sits on the stage.
	addFrame(
		span: Span,
		load: (api: { m2aLoad: (src: string, box: Box) => void }) => void,
		{ mode = "window", ...look }: FrameOptions = {},
	) {
		load({
			m2aLoad: (src, box) =>
				this.frames.push({
					span,
					src,
					box,
					...look,
					mode,
					title: src.split("/").pop() ?? src,
				}),
		});
		return this;
	}
}

export class MovieWizard {
	scenes: Scene[] = [];
	add(scene: Scene) {
		this.scenes.push(scene);
		return this;
	}
	get duration() {
		return Math.max(0, ...this.scenes.map((s) => s.span[1]));
	}
	sceneIndexAt(t: number) {
		return this.scenes.findIndex((s) => inSpan(s.span, t));
	}
	// lead: frames count as due this many seconds early, so a popup can load before its start
	framesAt(t: number, lead = 0) {
		return this.scenes.flatMap((s) =>
			s.frames.filter((f) => inSpan([f.span[0] - lead, f.span[1]], t)),
		);
	}
}
