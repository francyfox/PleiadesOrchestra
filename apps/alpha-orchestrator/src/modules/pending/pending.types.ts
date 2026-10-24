/** `GET /v1/widget/threads/:id/pending`. */
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
