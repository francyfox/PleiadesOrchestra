import { type Static, Type } from "@sinclair/typebox";

// Browser-importable: import only `@sinclair/typebox`, never elysia or server code.

/** A model of providers.toml, by provider id and model id. */
export const AgentPick = Type.Object({
	provider: Type.String({ minLength: 1, maxLength: 64 }),
	model: Type.String({ minLength: 1, maxLength: 200 }),
});

export type AgentPick = Static<typeof AgentPick>;
