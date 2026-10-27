import { t } from "elysia";
import { oneOf, PageQuery } from "../http/http.ts";

export const ACCESS_MODES = ["whitelist", "open"] as const;

export const AccessModeSchema = oneOf(ACCESS_MODES);
/** `ru`, `en`, `kk`, `pt-BR` — a language code, not a language name. */
export const LanguageSchema = t.String({ pattern: "^[a-z]{2}(-[A-Z]{2})?$" });
export const SlugSchema = t.String({
	pattern: "^[a-z0-9][a-z0-9-]*$",
	maxLength: 64,
});

// Response enums use UnionEnum: `oneOf` is typed `never` as an output (it exists for optional inputs).
const ChannelKindSchema = t.UnionEnum(["telegram", "cli", "web"]);

/** Short reference to a channel, embedded in other responses. */
export const ChannelRef = t.Object({
	id: t.String(),
	slug: t.String(),
	name: t.String(),
	kind: ChannelKindSchema,
});

/** A channel as the admin sees it; secrets are never included. */
export const Channel = t.Object({
	id: t.String(),
	slug: t.String(),
	name: t.String(),
	kind: ChannelKindSchema,
	accessMode: t.UnionEnum(ACCESS_MODES),
	allowedOrigins: t.Array(t.String()),
	/** Language the site's catalog is written in; search queries are sent in it. */
	catalogLanguage: t.String(),
	publishableKey: t.Nullable(t.String()),
	/** Unix ms when the channel was disabled; null while enabled. */
	disabledAt: t.Nullable(t.Number()),
	createdAt: t.Number(),
	/** admin-api account id of the owner; null = staff-owned. */
	ownerId: t.Nullable(t.String()),
	/** Intent sets in force, in order (later ones win); empty = no set, the site's tools are the goals. */
	intentSets: t.Array(t.String()),
	/** Delta splits a message of several tasks even without intent sets. */
	severalTasks: t.Boolean(),
});

export const ChannelsQuery = t.Composite([
	PageQuery,
	t.Object({ ownerId: t.Optional(t.String({ minLength: 1 })) }),
]);

export const ChannelsPage = t.Object({
	items: t.Array(Channel),
	total: t.Number(),
});

export const CreateChannelBody = t.Object({
	slug: SlugSchema,
	name: t.String({ minLength: 1 }),
	kind: t.Literal("web"),
	accessMode: AccessModeSchema,
	allowedOrigins: t.Array(t.String()),
	catalogLanguage: t.Optional(LanguageSchema),
	intentSets: t.Optional(t.Array(t.String())),
	severalTasks: t.Optional(t.Boolean()),
	/** admin-api account id; left out = staff-owned. */
	ownerId: t.Optional(t.String({ minLength: 1 })),
});

export const UpdateChannelBody = t.Object({
	name: t.Optional(t.String({ minLength: 1 })),
	accessMode: t.Optional(AccessModeSchema),
	allowedOrigins: t.Optional(t.Array(t.String())),
	catalogLanguage: t.Optional(LanguageSchema),
	intentSets: t.Optional(t.Array(t.String())),
	severalTasks: t.Optional(t.Boolean()),
	disabled: t.Optional(t.Boolean()),
});

/** The channel plus its secret key, shown only in this response. */
export const ChannelWithSecret = t.Object({
	channel: Channel,
	secretKey: t.String(),
});

export const ChannelResult = t.Object({ channel: Channel });
