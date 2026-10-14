import { eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import type { ChannelDirectory } from "../channel-directory/channel-directory.ts";
import { channels } from "../database/database.schema.ts";
import type { Db } from "../database/database.ts";
import {
	buildReplyPrompt,
	DEFAULT_PERSONA,
	effectivePersona,
	FIXED_BLOCK,
	getOverrides,
	PERSONA_LIMITS,
	savePersona,
} from "./persona.service.ts";

export interface PersonaDeps {
	db: Db;
	directory: ChannelDirectory;
	now: () => number;
}

/** Slots only: lengths are capped here, and the service flattens each to one line. */
export const PersonaBody = t.Object({
	botName: t.String({ maxLength: PERSONA_LIMITS.botName * 2 }),
	tone: t.String({ maxLength: PERSONA_LIMITS.tone * 2 }),
	instructions: t.String({ maxLength: PERSONA_LIMITS.instructions * 2 }),
	/** `ru`, `pt-BR`, or "" for the visitor's own language. */
	defaultLang: t.String({ pattern: "^([a-z]{2}(-[A-Z]{2})?)?$" }),
	greeting: t.String({ maxLength: PERSONA_LIMITS.greeting * 2 }),
	forbiddenTopics: t.Array(t.String({ maxLength: PERSONA_LIMITS.topic * 2 }), {
		maxItems: PERSONA_LIMITS.topics * 2,
	}),
	handoffContact: t.String({ maxLength: PERSONA_LIMITS.handoffContact * 2 }),
});

/** Admin routes for a channel's persona. Auth is enforced by the app's `onRequest` guard. */
export function personaRoutes({ db, directory, now }: PersonaDeps) {
	const exists = (id: string) =>
		db
			.select({ id: channels.id })
			.from(channels)
			.where(eq(channels.id, id))
			.get();
	/** What the dialog needs: the persona in effect, the standard values and the prompt built from them. */
	const view = (overrides: Parameters<typeof buildReplyPrompt>[0]) => ({
		persona: effectivePersona(overrides),
		defaults: DEFAULT_PERSONA,
		prompt: buildReplyPrompt(overrides),
		fixed: FIXED_BLOCK,
	});
	return (
		new Elysia({ prefix: "/v1/admin/channels/:id/persona" })
			.get("/", ({ params, status }) => {
				if (!exists(params.id)) return status(404, "Not found");
				return view(getOverrides(db, params.id));
			})
			.put(
				"/",
				({ params, body, status }) => {
					if (!exists(params.id)) return status(404, "Not found");
					savePersona(db, params.id, body, now());
					directory.invalidate();
					return view(getOverrides(db, params.id));
				},
				{ body: PersonaBody },
			)
			// Unsaved form values in, the prompt they would produce out. Writes nothing.
			.post(
				"/preview",
				({ params, body, status }) => {
					if (!exists(params.id)) return status(404, "Not found");
					return view(body);
				},
				{ body: PersonaBody },
			)
	);
}
