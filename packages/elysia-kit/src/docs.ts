import { openapi } from "@elysiajs/openapi";

export interface DocsOptions {
	title: string;
	description?: string;
	version?: string;
	/** The Scalar API reference lives here; the raw spec at `<path>/json`. */
	path?: `/${string}`;
	/** Sidebar groups in this order, with a line about each; routes pick one via `tags`. */
	tags?: { name: string; description?: string }[];
	/** Named security scheme shown as the "Authorize" button, e.g. a session cookie or a bearer key. */
	security?: "bearer" | "cookie";
}

/**
 * Scalar API reference + OpenAPI spec for a service (`@elysiajs/openapi`),
 * so every service documents itself the same way.
 */
export function docs(options: DocsOptions) {
	const path = options.path ?? "/swagger";
	return openapi({
		path,
		// The plugin's default spec URL is relative ("api/docs/json"), which a page at /api/docs resolves to /api/api/docs/json.
		scalar: { url: `${path}/json` },
		documentation: {
			info: {
				title: options.title,
				version: options.version ?? "0.0.0",
				description: options.description,
			},
			tags: options.tags,
			components: options.security
				? {
						securitySchemes:
							options.security === "bearer"
								? { bearer: { type: "http", scheme: "bearer" } }
								: {
										session: {
											type: "apiKey",
											in: "cookie",
											name: "better-auth.session_token",
										},
									},
					}
				: undefined,
			security: options.security
				? [{ [options.security === "bearer" ? "bearer" : "session"]: [] }]
				: undefined,
		},
	});
}
