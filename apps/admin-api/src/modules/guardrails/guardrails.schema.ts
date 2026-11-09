import { type Static, t } from "elysia";

export const GuardrailsInput = t.Object({
	enabled: t.Boolean(),
	rules: t.String({ maxLength: 260_000 }),
});
export type GuardrailsInput = Static<typeof GuardrailsInput>;

/** Prompt-injection filter (orchestrator `/v1/admin/guardrails`). */
export const Guardrails = t.Object({
	enabled: t.Boolean(),
	rules: t.String(),
	/** The built-in rules: what "Reset to defaults" restores. */
	defaults: t.String(),
});
export type Guardrails = Static<typeof Guardrails>;

/** One entry per bad rule line (1-based). */
export const GuardrailsErrors = t.Object({
	errors: t.Array(t.Object({ line: t.Number(), message: t.String() })),
});
export type GuardrailsErrors = Static<typeof GuardrailsErrors>;
