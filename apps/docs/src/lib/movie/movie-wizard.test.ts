import { expect, test } from "bun:test";
import { MovieWizard, Scene } from "./movie-wizard.ts";

const box = { x: 0, y: 0, w: 10, h: 10 };

test("scenes and frames are picked by timestamp, ends are exclusive", () => {
	const wizard = new MovieWizard()
		.add(new Scene([0, 4], ({ set }) => set({ src: "a.jpg" })))
		.add(
			new Scene([4, 9], ({ set }) =>
				set({ src: "b.jpg", className: "pan" }),
			).addFrame([5, 7], ({ m2aLoad }) => m2aLoad("/movie/x.m2a", box)),
		);
	expect(wizard.duration).toBe(9);
	expect(wizard.sceneIndexAt(3.9)).toBe(0);
	expect(wizard.sceneIndexAt(4)).toBe(1);
	expect(wizard.sceneIndexAt(9)).toBe(-1);
	expect(wizard.framesAt(4.5)).toEqual([]);
	expect(wizard.framesAt(5)[0]?.title).toBe("x.m2a");
	expect(wizard.framesAt(2.5, 2.5)[0]?.title).toBe("x.m2a");
	expect(wizard.framesAt(7)).toEqual([]);
});

test("a frame is a window unless asked to be a div", () => {
	const scene = new Scene([0, 4], ({ set }) => set({}))
		.addFrame([0, 4], ({ m2aLoad }) => m2aLoad("/movie/a.m2a", box))
		.addFrame([0, 4], ({ m2aLoad }) => m2aLoad("/movie/b.m2a", box), {
			mode: "div",
			background: "#000",
			transform: "rotate(3deg)",
		});
	expect(scene.frames.map((f) => f.mode)).toEqual(["window", "div"]);
	expect(scene.frames[1]?.transform).toBe("rotate(3deg)");
});
