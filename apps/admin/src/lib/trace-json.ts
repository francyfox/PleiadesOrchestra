/** The trace as the Model Context Tool Inspector's Trace button writes it: `JSON.stringify(trace, "", " ")`. */
export const traceText = (trace: unknown): string =>
	JSON.stringify(trace, null, " ");

export const traceFileName = (requestId: string): string =>
	`trace-${requestId}.json`;
