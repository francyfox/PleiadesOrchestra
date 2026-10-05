import { type Static, t } from "elysia";
import { nullable, oneOf } from "../common/common.schema.ts";

const ACCESS_MODES = ["whitelist", "open"] as const;

/**
 * DTOs of the orchestrator's admin API — docs/admin-api.md is the source of
 * truth. They double as this service's response schemas: whatever the
 * orchestrator sends is checked against them before it reaches the panel.
 */

export const ChannelKind = t.UnionEnum(["telegram", "cli", "web"]);

export const AccessMode = t.UnionEnum(ACCESS_MODES);

export const ChannelRef = t.Object({
	id: t.String(),
	slug: t.String(),
	name: t.String(),
	kind: ChannelKind,
});

export const Channel = t.Composite([
	ChannelRef,
	t.Object({
		accessMode: AccessMode,
		allowedOrigins: t.Array(t.String()),
		/** Language the site's catalog is written in; search queries are sent in it. */
		catalogLanguage: t.String(),
		publishableKey: nullable(t.String()),
		disabledAt: nullable(t.Number()),
		createdAt: t.Number(),
	}),
]);

/** Wire input of `POST /channels` (before the handler's slug/name check). */
export const CreateChannelInput = t.Object({
	slug: t.String(),
	name: t.String(),
	accessMode: t.Optional(oneOf(ACCESS_MODES)),
	allowedOrigins: t.Optional(t.Array(t.String())),
	catalogLanguage: t.Optional(t.String()),
});

export const UpdateChannelInput = t.Object({
	name: t.Optional(t.String()),
	accessMode: t.Optional(oneOf(ACCESS_MODES)),
	allowedOrigins: t.Optional(t.Array(t.String())),
	catalogLanguage: t.Optional(t.String()),
	disabled: t.Optional(t.Boolean()),
});

export const ChannelWithSecret = t.Object({
	channel: Channel,
	secretKey: t.String(),
});

export type ChannelKind = Static<typeof ChannelKind>;
export type AccessMode = Static<typeof AccessMode>;
export type ChannelRef = Static<typeof ChannelRef>;
export type Channel = Static<typeof Channel>;
export type CreateChannelInput = Static<typeof CreateChannelInput>;
export type UpdateChannelInput = Static<typeof UpdateChannelInput>;
