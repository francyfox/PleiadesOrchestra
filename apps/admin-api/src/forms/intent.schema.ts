import { type Static, Type } from "@sinclair/typebox";
import { oneOf } from "./provider.schema.ts";

// Browser-importable: import only `@sinclair/typebox`, never elysia or server code.

export const INTENT_VALUES = [
	"chat",
	"chooseStore",
	"navigate",
	"search",
	"filter",
	"select",
	"addToCart",
	"removeFromCart",
	"checkout",
	"paginate",
	"compare",
	"other",
] as const;

export const IntentStatus = oneOf(["pending", "approved", "rejected"]);
export const IntentLabel = oneOf(INTENT_VALUES);

/** A verdict: approve/reject, or correct the intent (which approves it). */
export const IntentVerdictInput = Type.Object({
	status: Type.Optional(IntentStatus),
	intent: Type.Optional(IntentLabel),
});

export type IntentVerdictInput = Static<typeof IntentVerdictInput>;
