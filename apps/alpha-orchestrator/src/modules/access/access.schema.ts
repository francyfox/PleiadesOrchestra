import { t } from "elysia";

export const AccessBody = t.Object({
	channel: t.String({ description: "Channel slug" }),
	externalUserId: t.String(),
	displayName: t.Optional(t.String()),
});

export const AccessResult = t.Object({
	allowed: t.Boolean(),
	/** Internal visitor id (wire name kept for transports). */
	userId: t.String(),
});
