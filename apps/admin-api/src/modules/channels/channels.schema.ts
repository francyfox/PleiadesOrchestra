import { type Static, t } from "elysia";
import {
	AccessMode,
	CreateChannelInput,
	Persona,
	UpdateChannelInput,
} from "../../forms/forms.ts";
import { nullable, PageQuery } from "../common/common.schema.ts";

// One definition with the admin forms.
export { AccessMode, CreateChannelInput, Persona, UpdateChannelInput };

/**
 * DTOs of the orchestrator's admin API — apps/docs/content/en/drafts/admin-api.md is the source of
 * truth. They double as this service's response schemas: whatever the
 * orchestrator sends is checked against them before it reaches the panel.
 */

export const ChannelKind = t.UnionEnum(["telegram", "cli", "web"]);

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
		intentSets: t.Array(t.String()),
		publishableKey: nullable(t.String()),
		disabledAt: nullable(t.Number()),
		createdAt: t.Number(),
		/** Account id of the owner; null = staff-owned. */
		ownerId: nullable(t.String()),
	}),
]);

/** `GET /channels`: paging, and for staff an optional owner filter (a user's list is always their own). */
export const ChannelsQuery = t.Composite([
	PageQuery,
	t.Object({ ownerId: t.Optional(t.String({ minLength: 1 })) }),
]);

/** The persona in effect, the standard values, and the prompt built from them (read-only). */
export const PersonaView = t.Object({
	persona: Persona,
	defaults: Persona,
	prompt: t.String(),
	/** The tail of `prompt` no one can edit, so the UI can mark it. */
	fixed: t.String(),
});

export const ChannelWithSecret = t.Object({
	channel: Channel,
	secretKey: t.String(),
});

export type PersonaView = Static<typeof PersonaView>;
export type ChannelKind = Static<typeof ChannelKind>;
export type ChannelRef = Static<typeof ChannelRef>;
export type Channel = Static<typeof Channel>;
