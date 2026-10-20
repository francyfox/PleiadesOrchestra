import { t } from "elysia";

/** A model service the orchestrator talks to, with its last health probe. */
export const Agent = t.Object({
	id: t.String(),
	name: t.String(),
	role: t.Union([
		t.Literal("text"),
		t.Literal("decision"),
		t.Literal("function-call"),
	]),
	/** Base URL without credentials. */
	endpoint: t.String(),
	model: t.Nullable(t.String()),
	status: t.Union([t.Literal("up"), t.Literal("down")]),
	latencyMs: t.Nullable(t.Number()),
	checkedAt: t.Number(),
});

export const AgentList = t.Object({ items: t.Array(Agent) });
