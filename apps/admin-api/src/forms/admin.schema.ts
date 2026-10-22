import { Type } from "@sinclair/typebox";

// Browser-importable: import only `@sinclair/typebox`, never elysia or server code.

/** A staff account; a blank name falls back to the email server-side. */
export const CreateAdminInput = Type.Object({
	name: Type.String(),
	email: Type.String(),
});

export const EditAdminInput = CreateAdminInput;

/** The edit dialog: `EditAdminInput` plus the id that goes in the URL. */
export const EditAdminForm = Type.Object({
	id: Type.String({ minLength: 1 }),
	...EditAdminInput.properties,
});

/** The signed-in customer's own account. A blank name is `invalid_name` server-side. */
export const UpdateMeInput = Type.Object({ name: Type.String() });
export const ChangeEmailInput = Type.Object({ email: Type.String() });
/** The server compares it with the account email (`confirm_mismatch`). */
export const DeleteMeInput = Type.Object({ confirmEmail: Type.String() });
