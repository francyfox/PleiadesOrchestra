import type { AnyWindow } from "./types.ts";

class ToolNameEvent extends Event {
	readonly #toolName: string;
	constructor(type: string, init: EventInit & { toolName?: string } = {}) {
		super(type, init);
		this.#toolName = init.toolName ?? "";
	}
	get toolName() {
		return this.#toolName;
	}
}

export class ToolActivatedEvent extends ToolNameEvent {}
export class ToolCancelEvent extends ToolNameEvent {}

/** Fires a tool event on `w`'s model context (silently skipped when unreachable). */
export function dispatchToolEvent(
	w: AnyWindow,
	type: "toolactivated" | "toolcancel",
	toolName: string,
): void {
	const Cls = type === "toolactivated" ? ToolActivatedEvent : ToolCancelEvent;
	try {
		w.document?.modelContext?.dispatchEvent(new Cls(type, { toolName }));
	} catch {
		/* cross-origin */
	}
}
