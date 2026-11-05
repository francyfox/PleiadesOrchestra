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
	marginPercent: Type.Number({ minimum: 0, maximum: 99 }),
	taxBase: Type.Union([
		Type.Literal("payout"),
		Type.Literal("revenue"),
		Type.Literal("profit"),
	]),
});

export type FinanceRates = Static<typeof FinanceRates>;

const PerMillion = Type.Number({ minimum: 0 });

/** USD per 1M tokens of a local model; no cache price = cached tokens cost the input price. */
export const LocalPriceInput = Type.Object({
	inputPerMillionUsd: PerMillion,
	outputPerMillionUsd: PerMillion,
	cacheReadPerMillionUsd: Type.Optional(PerMillion),
});

/** The local-price form: `LocalPriceInput` plus the model id that goes in the URL. */
export const LocalPriceForm = Type.Object({
	model: Type.String({ minLength: 1, maxLength: 200 }),
	...LocalPriceInput.properties,
});

export type LocalPriceInput = Static<typeof LocalPriceInput>;
