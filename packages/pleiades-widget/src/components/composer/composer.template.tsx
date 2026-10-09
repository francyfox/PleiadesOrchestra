import { h, render } from "@/jsx/jsx.ts";

export const composerTemplate = (scope: string) =>
	render(
		<form
			part="composer"
			x-data={scope}
			{...{ "x-on:submit.prevent": "submit" }}
		>
			<textarea
				rows="1"
				part="input"
				x-model="draft"
				x-bind:maxlength="maxChars"
				x-bind:placeholder="placeholder"
				x-bind:aria-label="placeholder"
				x-bind:disabled="inputDisabled"
				x-on:keydown="onKey"
			/>
			<button
				type="submit"
				part="send"
				x-bind:class="sendClass"
				x-bind:disabled="sendDisabled"
				x-bind:aria-label="sendAria"
				x-text="sendLabel"
			/>
		</form>,
	);
