import { Type } from "@sinclair/typebox";

// Browser-importable: import only `@sinclair/typebox`, never elysia or server code.

/** Whole USD (= TR). */
const AmountUsd = Type.Integer({ minimum: 1, maximum: 10_000 });

export const CheckoutInput = Type.Object({
	kind: Type.Union([Type.Literal("plan"), Type.Literal("credits")]),
	/** Credits only: the amount to preselect. Plans have a fixed price. */
	amountUsd: Type.Optional(AmountUsd),
});

/** The top-up form: the amount is required. */
export const TopUpForm = Type.Object({
	kind: Type.Literal("credits"),
	amountUsd: AmountUsd,
});
