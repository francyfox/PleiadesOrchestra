/** Where the panel's template puts its children (`<pl-slot />` in `panel.template.tsx`). */
const SLOT = "<pl-slot></pl-slot>";

/** The panel's markup with its children (the other components, already rendered) in place, in order. */
export const fillPanel = (html: string, children: readonly string[]) =>
	html.replace(SLOT, () => children.join("\n\t"));
