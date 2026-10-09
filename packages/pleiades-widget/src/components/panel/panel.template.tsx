import { h, render } from "@/jsx/jsx.ts";

/**
 * The side panel's frame. The components inside it are only known at runtime,
 * so the frame carries a `<pl-slot>` that `fillPanel` (panel.slot.ts) replaces.
 */
export const panelTemplate = (scope: string) =>
	render(
		<div
			class="panel"
			part="panel"
			id="panel"
			role="dialog"
			x-bind:aria-label="heading"
			inert
			x-data={scope}
			{...{ "x-on:keydown.escape": "onEscape" }}
		>
			<pl-slot />
		</div>,
	);
