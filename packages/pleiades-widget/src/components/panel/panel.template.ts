/** The side panel's frame; `children` are the components inside it, already rendered. */
export const panelTemplate = (children: readonly string[]) => (scope: string) =>
	`
<div class="panel" part="panel" id="panel" role="dialog" :aria-label="heading" inert x-data="${scope}" @keydown.escape="onEscape">
	${children.join("\n\t")}
</div>`;
