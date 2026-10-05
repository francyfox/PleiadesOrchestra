const SLUG = /^[a-z0-9-]+$/;
const LANGUAGE = /^[a-z]{2}(-[A-Z]{2})?$/;

/** Channel slugs are lowercase letters, digits and dashes. */
export function isValidSlug(slug: string): boolean {
	return SLUG.test(slug);
}

/** A language code (`ru`, `en`, `pt-BR`), not a language name. */
export function isValidLanguage(language: string): boolean {
	return LANGUAGE.test(language);
}
