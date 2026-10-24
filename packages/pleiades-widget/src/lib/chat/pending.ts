/** What `GET /v1/widget/threads/:id/pending` answers (the server's `Pending`). */
export type Pending =
	| { state: "none" }
	| {
			state: "waiting";
			callId: string;
			tool: string;
			arguments: Record<string, unknown>;
			tasksLeft: number;
	  }
	| { state: "interrupted"; runId: string; prompt: string; tasksLeft: number }
	| { state: "expired"; prompt: string; tasksLeft: number };

/** A browser tool call the server waits on (a `tool_call` line, or a `pending` answer). */
export interface HeldCall {
	tool: string;
	arguments: Record<string, unknown>;
	callId: string;
}

/** Words of a name: `addToCart`, `add-to-cart` and `add_to_cart` are the same. */
function words(name: string): string[] {
	return name
		.replace(/([a-z\d])([A-Z])/g, "$1 $2")
		.toLowerCase()
		.split(/[^a-z\d]+/)
		.filter(Boolean);
}

const READS = [
	"get",
	"list",
	"read",
	"view",
	"show",
	"fetch",
	"check",
	"status",
	"history",
	"search",
	"find",
	"lookup",
	"query",
];
const WRITES = [
	"remove",
	"delete",
	"clear",
	"empty",
	"cancel",
	"checkout",
	"pay",
	"purchase",
	"place",
	"add",
	"put",
	"buy",
	"update",
	"set",
	"save",
	"change",
	"edit",
	"modify",
];

/**
 * Whether a tool only reads, judged by its name like the server does
 * (`shop.tool-cues.ts`: the write verbs win, then a read verb decides).
 * Running a read twice costs nothing; a write twice adds twice.
 * shortcut: a copy of the English verb lists, not the server's; a tool named in
 * another language or without a verb counts as a write (asks, never runs alone).
 */
export function isReadTool(name: string): boolean {
	const parts = words(name);
	return (
		!parts.some((part) => WRITES.includes(part)) &&
		parts.some((part) => READS.includes(part))
	);
}

export type PendingAction =
	| { do: "nothing" }
	/** A read tool this page has: run it, the stream goes on. */
	| { do: "run" }
	/** Only the visitor can say whether to run it (or to give up): Continue / Cancel. */
	| { do: "ask"; tasksLeft: number }
	| { do: "retry"; prompt: string; tasksLeft: number };

/** The decision table: what the widget does with the server's answer. `onPage`: the tool is among this page's. */
export function decidePending(
	pending: Pending,
	onPage: boolean,
): PendingAction {
	switch (pending.state) {
		case "waiting":
			return onPage && isReadTool(pending.tool)
				? { do: "run" }
				: { do: "ask", tasksLeft: pending.tasksLeft };
		case "interrupted":
		case "expired":
			return {
				do: "retry",
				prompt: pending.prompt,
				tasksLeft: pending.tasksLeft,
			};
		default:
			return { do: "nothing" };
	}
}
