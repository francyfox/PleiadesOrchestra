/** The panel's title bar with its × button. */
export const headerTemplate = (scope: string) => `
<header part="header" x-data="${scope}">
	<b x-text="heading"></b>
	<button type="button" class="close" part="close" :aria-label="s.close" @click="close">×</button>
</header>`;
