import { t } from "elysia";

export const IdentifyBody = t.Object({
	visitorToken: t.String(),
	externalUserId: t.String({ minLength: 1 }),
});

export const IdentifyResult = t.Object({
	/** Id of the identified visitor (wire name kept for integrations) (the anonymous one, promoted, or the existing one it was merged into). */
	userId: t.String(),
	/** True when an existing identified visitor absorbed the anonymous one. */
	merged: t.Boolean(),
});
