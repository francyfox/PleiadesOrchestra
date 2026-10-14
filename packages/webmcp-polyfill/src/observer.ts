import { getLocalTools } from "./local-tools.ts";
import type { AnyWindow, NormalizedTool } from "./types.ts";

const WATCHED_ATTRIBUTES = [
	"toolname",
	"tooldescription",
	"toolparamdescription",
	"name",
	"type",
	"required",
];

/** Stable fingerprint of the declarative (form) tools' public shape. */
export function declarativeSignature(tools: NormalizedTool[]): string {
	return JSON.stringify(
		tools
			.filter((t) => t._form)
			.map(({ name, description, inputSchema }) => ({
				name,
				description,
				inputSchema,
			})),
	);
}

/** Calls `onChange` (batched per microtask) when the declarative tool set changes. */
export function observeDeclarativeTools(
	win: AnyWindow,
	onChange: () => void,
): void {
	const signature = () => declarativeSignature(getLocalTools(win));
	let current = signature();
	let scheduled = false;
	const check = () => {
		scheduled = false;
		const next = signature();
		if (next === current) return;
		current = next;
		onChange();
	};
	new MutationObserver(() => {
		if (scheduled) return;
		scheduled = true;
		queueMicrotask(check);
	}).observe(win.document.documentElement, {
		subtree: true,
		childList: true,
		attributes: true,
		attributeFilter: WATCHED_ATTRIBUTES,
	});
}
