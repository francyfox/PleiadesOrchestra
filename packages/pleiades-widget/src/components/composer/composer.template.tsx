import { h, raw, render } from "@/jsx/jsx.ts";
import { MIC_ICON } from "../icons.ts";

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
				type="button"
				part="mic"
				x-bind:class="micClass"
				x-bind:aria-pressed="listening"
				x-bind:aria-label="micLabel"
				x-bind:title="micLabel"
				x-bind:aria-disabled="micDisabled"
				x-on:click="toggleMic"
			>
				{raw(MIC_ICON)}
			</button>
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
