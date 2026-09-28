export interface Site {
	slug: string;
	host: string;
}

/** `PLEIADES_SITES`: comma-separated `slug=host` pairs, where `slug` is the orchestrator channel of that site. */
export function parseSites(raw: string): Site[] {
	return raw
		.split(",")
		.map((entry) => entry.trim())
		.filter(Boolean)
		.map((entry) => {
			const [slug = "", host = ""] = entry
				.split("=")
				.map((part) => part.trim());
			if (!slug || !host) {
				throw new Error(`PLEIADES_SITES: "${entry}" is not slug=host`);
			}
			return { slug, host };
		});
}

function hostOf(query: string): string {
	const text = query.trim().toLowerCase();
	try {
		return new URL(
			text.includes("://") ? text : `https://${text}`,
		).hostname.replace(/^www\./, "");
	} catch {
		return text;
	}
}

/** Matches a slug, a host, or a full URL of a connected site. */
export function findSite(sites: Site[], query: string): Site | undefined {
	const slug = query.trim().toLowerCase();
	const host = hostOf(query);
	return sites.find(
		(site) => site.slug.toLowerCase() === slug || hostOf(site.host) === host,
	);
}
