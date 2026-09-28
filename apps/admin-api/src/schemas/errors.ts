import { type Static, t } from "elysia";

/**
 * Every non-2xx body. `error` is a stable code the panel localizes
 * (`weak_password`, `last_admin`, …) — the API never returns UI text.
 * `message` is only for upstream failures (orchestrator down or refusing)
 * and is shown as-is.
 */
export const ApiError = t.Object({
	error: t.Optional(t.String()),
	message: t.Optional(t.String()),
	/** Minimum length for `weak_*` codes. */
	min: t.Optional(t.Number()),
	/** Upstream detail kept for humans, not for branching. */
	detail: t.Optional(t.String()),
});

export type ApiError = Static<typeof ApiError>;
