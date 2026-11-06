/** Hover handler for a table cell: the text that is cut with an ellipsis gets its full text as a native tooltip. */
export function titleWhenCut(event: Event) {
	const cell = event.currentTarget as HTMLElement;
	for (
		let el = event.target as HTMLElement | null;
		el;
		el = el === cell ? null : el.parentElement
	) {
		if (el.scrollWidth > el.clientWidth) {
			el.title = el.textContent?.trim() ?? "";
			return;
		}
	}
}
