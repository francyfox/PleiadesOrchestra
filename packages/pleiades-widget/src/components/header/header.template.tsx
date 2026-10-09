import { h, render } from "@/jsx/jsx.ts";

/** The panel's title bar with its × button. */
export const headerTemplate = (scope: string) =>
	render(
		<header part="header" x-data={scope}>
			<b x-text="heading" />
			<button
				type="button"
				class="close"
				part="close"
				x-bind:aria-label="s.close"
				x-on:click="close"
			>
				×
			</button>
		</header>,
	);
