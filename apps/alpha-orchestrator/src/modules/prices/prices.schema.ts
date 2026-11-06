import { type Static, t } from "elysia";

const PerMillion = t.Number({ minimum: 0 });

/** USD per 1M tokens; no `cacheReadPerMillionUsd` = cached tokens cost the input price. */
export const LocalPriceInput = t.Object({
	inputPerMillionUsd: PerMillion,
	outputPerMillionUsd: PerMillion,
	cacheReadPerMillionUsd: t.Optional(PerMillion),
});

export const LocalPrice = t.Object({
	model: t.String(),
	inputPerMillionUsd: PerMillion,
	outputPerMillionUsd: PerMillion,
	cacheReadPerMillionUsd: t.Nullable(PerMillion),
});

export const LocalPrices = t.Object({ items: t.Array(LocalPrice) });
export type LocalPriceInputValue = Static<typeof LocalPriceInput>;
