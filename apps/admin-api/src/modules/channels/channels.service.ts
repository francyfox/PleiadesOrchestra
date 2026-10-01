const SLUG = /^[a-z0-9-]+$/;

/** Channel slugs are lowercase letters, digits and dashes. */
export function isValidSlug(slug: string): boolean {
	return SLUG.test(slug);
}
