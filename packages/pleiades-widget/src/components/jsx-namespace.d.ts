// Types for the JSX factory in ./jsx.ts (classic mode: `h` and `Fragment` must be in scope).
declare namespace JSX {
	type Element = Node;
	interface IntrinsicElements {
		[tag: string]: Record<string, unknown>;
	}
	interface ElementChildrenAttribute {
		children: unknown;
	}
}
