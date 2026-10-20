import { t } from "elysia";

/** What the visitor meets: the bot's name, tone and limits. Empty string / list = not set. */
export const Persona = t.Object({
	botName: t.String(),
	tone: t.String(),
	instructions: t.String(),
	/** `ru`, `pt-BR`, or "" for the visitor's own language. */
	defaultLang: t.String(),
	greeting: t.String(),
	forbiddenTopics: t.Array(t.String()),
	handoffContact: t.String(),
});

/** The persona in effect, the standard values and the reply prompt built from them. */
export const PersonaView = t.Object({
	persona: Persona,
	defaults: Persona,
	prompt: t.String(),
	/** The tail of `prompt` no one can edit. */
	fixed: t.String(),
});
