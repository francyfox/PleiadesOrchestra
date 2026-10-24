import { h, raw, render } from "@/jsx/jsx.ts";
import { LANG_NAMES } from "@/lib/i18n/i18n.ts";
import { LANGUAGES_ICON } from "../icons.ts";

/**
 * The panel's title bar: the language picker and the × button. The picker is a
 * native `<select>` laid transparently over the icon: a real listbox with
 * keyboard, outside-click and Escape handling, in a few bytes.
 */
export const headerTemplate = (scope: string) =>
	render(
		<header part="header" x-data={scope}>
			<b x-text="heading" />
			<span class="tools">
				<label class="lang" part="lang">
					{raw(LANGUAGES_ICON)}
					<select
						part="lang-select"
						x-bind:aria-label="s.language"
						x-bind:value="lang"
						x-on:change="pickLang"
					>
						{Object.entries(LANG_NAMES).map(([code, name]) => (
							<option value={code}>{name}</option>
						))}
					</select>
				</label>
				<button
					type="button"
					class="close"
					part="close"
					x-bind:aria-label="s.close"
					x-on:click="close"
				>
					×
				</button>
			</span>
		</header>,
	);
