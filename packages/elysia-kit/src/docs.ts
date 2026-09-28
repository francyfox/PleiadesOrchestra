import { openapi } from "@elysiajs/openapi";

export interface DocsOptions {
	title: string;
	description?: string;
	version?: string;
	/** Swagger UI lives here; the raw spec at `<path>/json`. */
	path?: `/${string}`;
	/** Named security scheme shown as the "Authorize" button, e.g. a session cookie or a bearer key. */
	security?: "bearer" | "cookie";
}

/**
 * Swagger UI + OpenAPI spec for a service. `@elysiajs/openapi` is the
 * maintained successor of `@elysiajs/swagger` and renders the same
 * Swagger UI, so every service documents itself the same way.
 */
export function docs(options: DocsOptions) {
	const path = options.path ?? "/swagger";
	return openapi({
		path,
		provider: "swagger-ui",
		documentation: {
			info: {
				title: options.title,
				version: options.version ?? "0.0.0",
				description: options.description,
			},
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
