/**
 * JSX as a string templating language: `<p class="a">{x}</p>` becomes the HTML
 * string Alpine then initializes in place. Nothing here touches the DOM —
 * the output is the same kind of static markup the components always
 * carried, now with types, editor support, escaping and components.
 *
 * Alpine's directives must be written in their long forms (`x-on:click`,
 * `x-bind:disabled`): the shorthands `@click` and `:disabled` are not valid
 * JSX attribute names. Neither is a name with a modifier (`x-on:submit.prevent`):
 * those are spread in, `{...{ "x-on:submit.prevent": "submit" }}`.
 *
 * Wired through tsconfig.json (`jsxFactory: "h"`, `jsxFragmentFactory:
 * "Fragment"`), which both Vite and `bun test` read; a `.tsx` file imports
 * `h` (and `Fragment` when it uses `<>`).
 */

/** Markup that is already escaped (the output of `h`) — never escaped again. */
class Html {
	constructor(readonly value: string) {}
	toString() {
		return this.value;
	}
}

type Child = Html | string | number | boolean | null | undefined | Child[];
type Props = Record<string, unknown> & { children?: Child };
type Component = (props: Props) => Html;

const VOID = new Set([
	"area",
	"br",
	"col",
	"hr",
	"img",
	"input",
	"meta",
	"wbr",
]);

const escapeText = (text: string) =>
	text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");

function children(list: Child[]): string {
	let out = "";
	for (const child of list) {
		if (child === null || child === undefined || typeof child === "boolean")
			continue;
		if (Array.isArray(child)) out += children(child);
		else if (child instanceof Html) out += child.value;
		else out += escapeText(String(child));
	}
	return out;
}

function attributes(props: Props): string {
	let out = "";
	for (const [name, value] of Object.entries(props)) {
		if (
			name === "children" ||
			// `__source`/`__self`: debug props the compiler adds in development builds.
			name.startsWith("__") ||
			value === null ||
			value === undefined ||
			value === false
		)
			continue;
		out +=
			value === true ? ` ${name}` : ` ${name}="${escapeText(String(value))}"`;
	}
	return out;
}

export function h(
	tag: string | Component,
	props: Props | null,
	...kids: Child[]
): Html {
	if (typeof tag === "function") return tag({ ...props, children: kids });
	const open = `<${tag}${attributes(props ?? {})}>`;
	return new Html(VOID.has(tag) ? open : `${open}${children(kids)}</${tag}>`);
}

export const Fragment = ({ children: kids }: { children?: Child }): Html =>
	new Html(children([kids]));

/** Trusted markup (an inline SVG icon) to place in a tree as it is. Never pass anything from outside. */
export const raw = (markup: string): Html => new Html(markup);

/** The markup of a finished tree, as the string a component's `template` returns. */
export const render = (tree: Html): string => tree.value;

// The types TypeScript reads for `<tag attr="…">` (found through the `h` factory).
export declare namespace h {
	namespace JSX {
		type Element = Html;
		interface IntrinsicElements {
			[tag: string]: Record<string, unknown>;
		}
		interface ElementChildrenAttribute {
			children: unknown;
		}
	}
}
