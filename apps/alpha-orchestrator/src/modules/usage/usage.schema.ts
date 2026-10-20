import { t } from "elysia";
import { oneOf } from "../http/http.ts";

export const UsageQuery = t.Object({
	groupBy: oneOf(["day", "visitor", "channel", "model"]),
	/** Period start, epoch ms (default: 30 days ago). */
	from: t.Optional(t.Numeric()),
	/** Period end, epoch ms (default: now). */
	to: t.Optional(t.Numeric()),
	/** Only calls of the channel with this slug. */
	channel: t.Optional(t.String()),
	/** Only calls of the channels owned by this admin-api account. */
	ownerId: t.Optional(t.String({ minLength: 1 })),
});

export const UsageTotals = t.Object({
	inputTokens: t.Number(),
	outputTokens: t.Number(),
	calls: t.Number(),
	/** Calls whose provider reported no token counts. */
	callsWithoutUsage: t.Number(),
});

/** One group of the usage table. */
export const UsageRow = t.Composite([
	UsageTotals,
	t.Object({
		/** Day, visitor id, channel slug or model; `null` for deleted visitors and channels. */
		key: t.Nullable(t.String()),
		label: t.String(),
		avgLatencyMs: t.Number(),
		/** Tokens x model price; `null` when prices could not be fetched, 0 for local models. */
		costUsd: t.Nullable(t.Number()),
		/** Model rows only: USD per 1M tokens; `null` = no price (a local model). */
		price: t.Optional(
			t.Nullable(
				t.Object({
					inputPerMillion: t.Number(),
					outputPerMillion: t.Number(),
				}),
			),
		),
	}),
]);

export const UsageReport = t.Object({ rows: t.Array(UsageRow) });
