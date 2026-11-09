import { Elysia } from "elysia";

const ENCODED_SLASH = /%2f/gi;

/**
 * Elysia 1.4.31 stopped decoding `%2F` in path parameters (it stays `a%2Fb`), while ids with a slash
 * (a model `vendor/model`, a thread `channel/1`) are sent encoded. This turns it back into `/` before
 * validation and the handler, for every route.
 * shortcut: a literal "%2F" inside an id arrives as `%252F` and is decoded to `/` too; no id has one, so upgrade only if it does.
 */
export const decodeSlashParams = () =>
	new Elysia({ name: "decode-slash-params" }).onTransform(
		{ as: "global" },
		({ params }) => {
			for (const [name, value] of Object.entries(params ?? {})) {
				if (typeof value === "string") {
					params[name] = value.replace(ENCODED_SLASH, "/");
				}
			}
		},
	);
