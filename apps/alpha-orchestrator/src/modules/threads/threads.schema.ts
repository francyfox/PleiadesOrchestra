import { t } from "elysia";

export const ResetThreadQuery = t.Object({
	channel: t.Optional(
		t.String({
			description: "Channel slug; narrows the reset to that channel",
		}),
	),
});
