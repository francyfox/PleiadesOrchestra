import { createMapOperator, createPipelineOperator } from "transferum";

/**
 * A pure sync transform — no transferum transfer graph needed here, just
 * operator composition. Canonical unicode form, no stray control bytes, no
 * redundant whitespace burning the model's small context budget.
 */
export const normalizeText = createPipelineOperator<string, string>([
	createMapOperator((text: string) => text.normalize("NFC")),
	// Whitespace (including newlines/tabs) collapses to a single space *before*
	// control-char stripping — otherwise "hi\nthere" loses its word boundary
	// and becomes "hithere" instead of "hi there".
	createMapOperator((text: string) => text.replace(/\s+/g, " ")),
	createMapOperator((text: string) => text.replace(/\p{Cc}/gu, "")),
	createMapOperator((text: string) => text.trim()),
]);
