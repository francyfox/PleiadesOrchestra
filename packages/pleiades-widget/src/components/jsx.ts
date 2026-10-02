/**
 * A ~400-byte JSX runtime that builds real DOM nodes (no virtual DOM, no
 * React): `<button onClick={f}>x</button>` becomes `h("button", { onClick: f }, "x")`.
 * Components are plain functions; anything that changes later returns the
 * handles (`update`, `render`, …) its caller needs.
 */
export type Child =
	| Node
	| string
	| number
	| boolean
	| null
	| undefined
	| Child[];
export type Props = Record<string, unknown>;

const SVG = "http://www.w3.org/2000/svg";
const SVG_TAGS = new Set(["svg", "path", "rect", "circle", "g"]);

function append(parent: Node, child: Child): void {
	if (Array.isArray(child)) {
		for (const item of child) append(parent, item);
	} else if (
		child !== null &&
		child !== undefined &&
		typeof child !== "boolean"
	) {
		parent.appendChild(
			child instanceof Node ? child : document.createTextNode(String(child)),
		);
	}
}

export function h(
	tag: string | ((props: never) => Node),
	props: Props | null,
	...children: Child[]
): Node {
	if (typeof tag === "function") return tag({ ...props, children } as never);

	const el = SVG_TAGS.has(tag)
		? document.createElementNS(SVG, tag)
		: document.createElement(tag);
	for (const [key, value] of Object.entries(props ?? {})) {
		if (key === "ref") (value as (el: Element) => void)(el);
		else if (key === "value") (el as HTMLTextAreaElement).value = String(value);
		else if (key.startsWith("on"))
			el.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
		else if (value === true) el.setAttribute(key, "");
		else if (value !== false && value !== null && value !== undefined)
			el.setAttribute(key, String(value));
	}
	append(el, children);
	return el;
}

export function Fragment({ children }: { children?: Child }): Node {
	const fragment = document.createDocumentFragment();
	append(fragment, children);
	return fragment;
}
