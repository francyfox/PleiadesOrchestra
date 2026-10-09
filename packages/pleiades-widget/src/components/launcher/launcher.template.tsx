import { h, raw, render } from "@/jsx/jsx.ts";
import { CHAT_ICON } from "../icons.ts";

/** The round button in the corner that opens and closes the panel. */
export const launcherTemplate = (scope: string) =>
	render(
		<button
			type="button"
			class="launcher"
			part="launcher"
			aria-controls="panel"
			x-data={scope}
			x-bind:aria-expanded="expanded"
			x-bind:aria-label="label"
			x-bind:title="title"
			x-bind:aria-keyshortcuts="keyshortcuts"
			x-on:click="toggle"
		>
			{raw(CHAT_ICON)}
		</button>,
	);
