import { type Static, Type } from "@sinclair/typebox";

// Browser-importable: import only `@sinclair/typebox`, never elysia or server code.

const Percent = Type.Number({ minimum: 0, maximum: 100 });

/** Staff-editable finance rates in percent (fixed fee in USD); same limits as the orchestrator. */
export const FinanceRates = Type.Object({
	feeFixedUsd: Type.Number({ minimum: 0 }),
	feePercent: Percent,
	payoutPercent: Percent,
	taxPercent: Percent,
	conversionPercent: Percent,
	taxBase: Type.Union([
		Type.Literal("payout"),
		Type.Literal("revenue"),
		Type.Literal("profit"),
	]),
});

export type FinanceRates = Static<typeof FinanceRates>;
