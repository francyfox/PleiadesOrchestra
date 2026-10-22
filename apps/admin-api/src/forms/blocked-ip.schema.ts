import { type Static, Type } from "@sinclair/typebox";

// Browser-importable: import only `@sinclair/typebox`, never elysia or server code.

export const CreateBlockedIpInput = Type.Object({
	ip: Type.String(),
	/** Left out = global block (staff only). */
	channelId: Type.Optional(Type.String()),
	reason: Type.String(),
	/** Any positive number is accepted (the server answers `invalid_block` otherwise). */
	expiresInHours: Type.Number(),
});

/** The dialog: whole hours from 1 (the server takes any positive number). */
export const BlockedIpForm = Type.Object({
	...CreateBlockedIpInput.properties,
	expiresInHours: Type.Number({ minimum: 1 }),
});

/** A customer's form: a channel is required (only staff block globally). */
export const CustomerBlockedIpForm = Type.Object({
	...BlockedIpForm.properties,
	channelId: Type.String({ minLength: 1 }),
});

export type CreateBlockedIpInput = Static<typeof CreateBlockedIpInput>;
