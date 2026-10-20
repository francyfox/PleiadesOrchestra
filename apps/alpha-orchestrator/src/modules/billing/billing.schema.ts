import { t } from "elysia";

export const PolarWebhookResult = t.Object({
	ok: t.Literal(true),
	/** Present (true) when this webhook id was already processed. */
	duplicate: t.Optional(t.Literal(true)),
});
