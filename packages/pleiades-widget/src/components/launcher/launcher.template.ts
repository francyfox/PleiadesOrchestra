import { CHAT_ICON } from "../icons.ts";

/** The round button in the corner that opens and closes the panel. */
export const launcherTemplate = (scope: string) => `
<button type="button" class="launcher" part="launcher" aria-controls="panel" x-data="${scope}"
	:aria-expanded="expanded" :aria-label="label" @click="toggle">${CHAT_ICON}</button>`;
