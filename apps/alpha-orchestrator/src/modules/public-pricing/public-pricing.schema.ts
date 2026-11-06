import { t } from "elysia";

export const PublicPricing = t.Object({
	currency: t.Literal("USD"),
	unit: t.String(),
	topUps: t.Array(
		t.Object({
			paidUsd: t.Number(),
			creditedTr: t.Number(),
			feesAndTaxUsd: t.Number(),
			serviceUsd: t.Number(),
		}),
	),
	models: t.Array(
		t.Object({
			id: t.String(),
			inputPerMillionTr: t.Number(),
			outputPerMillionTr: t.Number(),
			cacheReadPerMillionTr: t.Optional(t.Number()),
		}),
	),
	updatedAt: t.Number(),
});
