import { type Plugin, type ResolvedConfig, runnerImport } from "vite";

/** What stands in for the component's scope name while the template is rendered at build time. */
const SCOPE = "__pl_scope__";

type Template = (scope: string) => string;

/**
 * Turns every `*.template.tsx` into plain strings at build time: the module
 * is executed once here, in Node (through Vite's own module runner, so the
 * TSX transform, tsconfig and the `@/` alias are the project's own), and what
 * the bundle gets is `export const x = (scope) => "<html…>".replaceAll(…)`.
 * Neither the JSX runtime (`src/jsx`) nor the components reach the bundle, so
 * templates cost only their markup. The scope name is the one thing known
 * only at runtime, hence the placeholder.
 *
 * Every export of a template module must be a function `(scope) => string`.
 */
export function prerenderJsx(): Plugin {
	let config: ResolvedConfig;
	return {
		name: "pleiades-prerender-jsx",
		enforce: "pre",
		configResolved(resolved) {
			config = resolved;
		},
		async transform(_code, id) {
			const file = id.split("?")[0] ?? id;
			if (!file.endsWith(".template.tsx")) return null;

			const { module } = await runnerImport<Record<string, unknown>>(file, {
				configFile: false,
				root: config.root,
				logLevel: "silent",
				resolve: { alias: config.resolve.alias },
			});

			const exports = Object.entries(module).map(([name, value]) => {
				if (typeof value !== "function")
					throw new Error(
						`${file}: export "${name}" must be a template function (scope) => string`,
					);
				const html = (value as Template)(SCOPE);
				return `export const ${name} = (scope) => ${JSON.stringify(html)}.replaceAll(${JSON.stringify(SCOPE)}, scope);`;
			});
			return { code: exports.join("\n"), map: null };
		},
	};
}
