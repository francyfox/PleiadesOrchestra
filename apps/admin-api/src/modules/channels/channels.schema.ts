import { type Static, t } from "elysia";
import { nullable, oneOf } from "../common/common.schema.ts";

const ACCESS_MODES = ["whitelist", "open"] as const;

/**
 * DTOs of the orchestrator's admin API — apps/docs/content/en/drafts/admin-api.md is the source of
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

/** What the visitor meets: the bot's name, tone and limits. Empty string / list = not set. */
export const Persona = t.Object({
	botName: t.String(),
	tone: t.String(),
	/** Multi-line role / behaviour text; the fixed rules always come after it. */
	instructions: t.String(),
	/** `ru`, `pt-BR`, or "" = the visitor's own language. */
	defaultLang: t.String(),
	greeting: t.String(),
	forbiddenTopics: t.Array(t.String()),
	handoffContact: t.String(),
});

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

export type Persona = Static<typeof Persona>;
export type PersonaView = Static<typeof PersonaView>;
export type ChannelKind = Static<typeof ChannelKind>;
export type AccessMode = Static<typeof AccessMode>;
export type ChannelRef = Static<typeof ChannelRef>;
export type Channel = Static<typeof Channel>;
export type CreateChannelInput = Static<typeof CreateChannelInput>;
export type UpdateChannelInput = Static<typeof UpdateChannelInput>;
