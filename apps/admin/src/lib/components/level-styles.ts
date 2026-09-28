import type { LoadLevel } from "$lib/system/load-level";

/** Colours of the green / yellow / red load indicator (`unknown` is neutral, never green). */
export const levelBadgeClass: Record<LoadLevel, string> = {
	ok: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
	warn: "bg-amber-500/20 text-amber-700 dark:text-amber-400",
	critical: "bg-red-500/15 text-red-700 dark:text-red-400",
	unknown: "bg-muted text-muted-foreground",
};

export const levelDotClass: Record<LoadLevel, string> = {
	ok: "bg-emerald-500",
	warn: "bg-amber-500",
	critical: "bg-red-500",
	unknown: "bg-muted-foreground/50",
};
