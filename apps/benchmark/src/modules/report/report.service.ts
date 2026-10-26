import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Where a bench writes: `--output` as given, else `results/<bench>/<timestamp>.<ext>`
 * (the folder is created). The timestamp has no colons, so it is a safe file name.
 */
export function resultPath(
	bench: string,
	ext: string,
	output?: string,
	deps: { now?: Date; root?: string } = {},
): string {
	const path =
		output ??
		join(
			deps.root ?? "results",
			bench,
			`${(deps.now ?? new Date()).toISOString().slice(0, 19).replaceAll(":", "-")}.${ext}`,
		);
	mkdirSync(dirname(path), { recursive: true });
	return path;
}
