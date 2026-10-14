import { lines } from "$lib/actions";
import type { Persona } from "$lib/api-types";

/** The dialog keeps forbidden topics as one text (a topic per line); the API wants a list. */
export type PersonaForm = Omit<Persona, "forbiddenTopics"> & {
	forbiddenTopics: string;
};

export const toForm = (persona: Persona): PersonaForm => ({
	...persona,
	forbiddenTopics: persona.forbiddenTopics.join("\n"),
});

export const toPersona = (form: PersonaForm): Persona => ({
	...form,
	forbiddenTopics: lines(form.forbiddenTopics),
});
