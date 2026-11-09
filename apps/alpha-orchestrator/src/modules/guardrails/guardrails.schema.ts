import { t } from "elysia";

export const GuardrailsBody = t.Object({
	enabled: t.Boolean(),
	// 500 rules x 500 chars + line breaks: the service reports the per-line limits.
	rules: t.String({ maxLength: 260_000 }),
});

export const GuardrailsView = t.Object({
	enabled: t.Boolean(),
	rules: t.String(),
	/** The built-in rules: what "Reset to defaults" restores. */
	defaults: t.String(),
});

export const GuardrailsErrors = t.Object({
	errors: t.Array(t.Object({ line: t.Number(), message: t.String() })),
});
