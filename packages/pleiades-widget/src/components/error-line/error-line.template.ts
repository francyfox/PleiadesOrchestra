/** The one-line problem report above the message box; hidden while there is none. */
export const errorLineTemplate = (scope: string) => `
<p class="error" part="error" role="alert" x-data="${scope}" x-show="text" x-text="text"></p>`;
