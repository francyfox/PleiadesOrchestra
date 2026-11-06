/** The stack release this checkout is at; bump with the changelog. `PLEIADES_VERSION` (the same variable `install.sh` takes as the image tag) wins when set. */
export const FALLBACK_VERSION = "0.13.10";

export const resolveVersion = (
	env: Record<string, string | undefined> = process.env,
) => env.PLEIADES_VERSION?.trim() || FALLBACK_VERSION;
