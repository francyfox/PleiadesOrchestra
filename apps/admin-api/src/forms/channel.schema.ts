import { PRESET_IDS } from "@repo/intent-presets/ids";
import { type Static, Type } from "@sinclair/typebox";

// Browser-importable (the admin validates forms with these): import only `@sinclair/typebox`, never elysia or server code.

/** Lowercase letters, digits and dashes. The route checks it in the handler (400 `invalid_channel`); only the form schemas carry it. */
export const SLUG_PATTERN = "^[a-z0-9-]+$";
/** A language code (`ru`, `en`, `pt-BR`), not a language name; the handler answers 400 `invalid_language`. */
export const LANGUAGE_PATTERN = "^[a-z]{2}(-[A-Z]{2})?$";

// Not `Type.UnionEnum`: Elysia fills a missing `UnionEnum` field with its first value inside `Optional`.
export const AccessMode = Type.Union([
	Type.Literal("whitelist"),
	Type.Literal("open"),
]);

/** The intent sets (presets) a channel can use, from `@repo/intent-presets`; none picked = the site's own tools are the goals. */
export const INTENT_SET_IDS = PRESET_IDS;

/** Wire input of `POST /channels` (before the handler's slug/name check). */
export const CreateChannelInput = Type.Object({
	slug: Type.String(),
	name: Type.String(),
	accessMode: Type.Optional(AccessMode),
	allowedOrigins: Type.Optional(Type.Array(Type.String())),
	catalogLanguage: Type.Optional(Type.String()),
	/** Ids of the intent sets, later ones win; left out or empty = none. */
	intentSets: Type.Optional(Type.Array(Type.String())),
	/** Staff only: the account that will own the channel. A user's channel is always theirs. */
	ownerId: Type.Optional(Type.String({ minLength: 1 })),
});

export const UpdateChannelInput = Type.Object({
	name: Type.Optional(Type.String()),
	accessMode: Type.Optional(AccessMode),
	allowedOrigins: Type.Optional(Type.Array(Type.String())),
	catalogLanguage: Type.Optional(Type.String()),
	intentSets: Type.Optional(Type.Array(Type.String())),
	/** Delta splits a message of several tasks even without intent sets. */
	severalTasks: Type.Optional(Type.Boolean()),
	disabled: Type.Optional(Type.Boolean()),
});

/** The create dialog: the wire body with the rules the handler applies. */
export const CreateChannelForm = Type.Object({
	...CreateChannelInput.properties,
	slug: Type.String({ pattern: SLUG_PATTERN }),
	name: Type.String({ minLength: 1 }),
	catalogLanguage: Type.Optional(Type.String({ pattern: LANGUAGE_PATTERN })),
});

/** The edit dialog: `id` goes in the URL; `disabled` is the row toggle's, not this form's. */
export const UpdateChannelForm = Type.Object({
	id: Type.String({ minLength: 1 }),
	name: Type.Optional(Type.String({ minLength: 1 })),
	accessMode: Type.Optional(AccessMode),
	allowedOrigins: UpdateChannelInput.properties.allowedOrigins,
	catalogLanguage: CreateChannelForm.properties.catalogLanguage,
	intentSets: UpdateChannelInput.properties.intentSets,
	severalTasks: UpdateChannelInput.properties.severalTasks,
});

/** What the visitor meets: the bot's name, tone and limits. Empty string / list = not set. */
export const Persona = Type.Object({
	botName: Type.String(),
	tone: Type.String(),
	/** Multi-line role / behaviour text; the fixed rules always come after it. */
	instructions: Type.String(),
	/** `ru`, `pt-BR`, or "" = the visitor's own language. */
	defaultLang: Type.String(),
	greeting: Type.String(),
	forbiddenTopics: Type.Array(Type.String()),
	handoffContact: Type.String(),
});

/** The persona dialog: `Persona` plus the channel id and the instructions cap the dialog always had. */
export const PersonaForm = Type.Object({
	id: Type.String({ minLength: 1 }),
	...Persona.properties,
	instructions: Type.String({ maxLength: 2000 }),
});

export type AccessMode = Static<typeof AccessMode>;
export type CreateChannelInput = Static<typeof CreateChannelInput>;
export type UpdateChannelInput = Static<typeof UpdateChannelInput>;
export type Persona = Static<typeof Persona>;
