import { type Static, t } from "elysia";
import { nullable, WorldState } from "../common/common.schema.ts";

export const GoapActionInfo = t.Object({
	name: t.String(),
	cost: t.Number(),
	preconditions: WorldState,
	effects: WorldState,
});

/**
 * An action that only ever existed per-request — a WebMCP tool catalog a
 * visitor's browser sent with one of their messages — reconstructed from
 * that user's own plan-run history (`?userId=` on `/goap/actions`), not a
 * live catalog. No `preconditions`: no trace event carries an action's full
 * precondition set, so it isn't guessed. See docs/laya-autonomous-webmcp.md.
 */
export const DynamicActionInfo = t.Object({
	name: t.String(),
	cost: nullable(t.Number()),
	effects: WorldState,
	lastSeenAt: t.Number(),
});

export type GoapActionInfo = Static<typeof GoapActionInfo>;
export type DynamicActionInfo = Static<typeof DynamicActionInfo>;
