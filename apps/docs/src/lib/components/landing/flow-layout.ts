export type Side = "left" | "right" | "top" | "bottom";
export type Slot = { x: number; y: number; in: Side; out: Side };

const PER_ROW = 4;
const STEP_X = 260;
const STEP_Y = 300;
const NARROW_STEP = 160;

/**
 * Wide: a snake of rows of four (row 0 left to right, row 1 right to left, ...); the last node of a
 * row hands down to the first of the next. Narrow: one column. The options fan sits right of the
 * `fanAt` node (shortcut: assumed to be on a left-to-right row, put it there), top-left in `fan`.
 */
export function layoutFlow(ids: string[], narrow: boolean, fanAt?: string) {
	const slots: Record<string, Slot> = {};
	let extra = 0;
	ids.forEach((id, i) => {
		const row = Math.floor(i / PER_ROW);
		const col = i % PER_ROW;
		const ltr = row % 2 === 0;
		const last = i === ids.length - 1;
		slots[id] = narrow
			? { x: 0, y: i * NARROW_STEP + extra, in: "top", out: "bottom" }
			: {
					x: (ltr ? col : PER_ROW - 1 - col) * STEP_X,
					y: row * STEP_Y,
					in: col === 0 && row > 0 ? "top" : ltr ? "left" : "right",
					out: col === PER_ROW - 1 && !last ? "bottom" : ltr ? "right" : "left",
				};
		if (id === fanAt) {
			slots[id].out = "right";
			// Room for the stack in the column; the next node's edge comes from the chosen option.
			if (narrow) extra = NARROW_STEP;
		}
	});
	const at = fanAt ? slots[fanAt] : undefined;
	const fan = at && {
		x: narrow ? 240 : at.x + STEP_X,
		y: at.y - (narrow ? 70 : 110),
	};
	const rows = Math.ceil(ids.length / PER_ROW);
	const maxY = narrow
		? (ids.length - 1) * NARROW_STEP + extra
		: (rows - 1) * STEP_Y;
	// Figure height in rem, so fitView keeps the text readable.
	const height = narrow ? ((maxY + 110) * 0.85) / 16 : 4 + 12 * rows;
	return { slots, fan, height };
}
