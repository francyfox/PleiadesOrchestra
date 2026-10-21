import { t } from "elysia";

export const AccessBody = t.Object({
	channel: t.String({ description: "Channel slug" }),
	externalUserId: t.String(),
	displayName: t.Optional(t.String()),
});

export const AccessResult = t.Object({
	allowed: t.Boolean(),
	/** Why a transport must stay silent that isn't the sender's own status: the channel's owner has no plan or balance. */
	reason: t.Optional(t.Literal("suspended")),
	/** Internal visitor id (wire name kept for transports). */
	userId: t.String(),
});
