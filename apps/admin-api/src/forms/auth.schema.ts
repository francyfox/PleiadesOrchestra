import { Type } from "@sinclair/typebox";

// Browser-importable: import only `@sinclair/typebox`, never elysia or server code.
// The sign-in and registration routes (`modules/accounts`, `modules/session`) take plain `t.String()` bodies and check the rules
// in code; these schemas carry the same rules for the admin's forms (a mismatch is caught by `forms.test.ts`).

/** Shortest password the panel accepts (customers; staff sign in with a token). Server: `MIN_PASSWORD` (`weak_credentials` / `weak_password`). */
export const MIN_PASSWORD = 12;

/** One `@`, no spaces. Server: `isEmail` in `admin-policy.service.ts`. */
const EMAIL = Type.String({ pattern: "^[^\\s@]+@[^\\s@]+$" });

/** Staff sign-in, `POST /auth/token`. */
export const TokenLoginForm = Type.Object({
	token: Type.String({ minLength: 1 }),
});

/** Customer sign-in, `POST /user/login`; no minimum: an old password must still work. */
export const UserLoginForm = Type.Object({
	email: EMAIL,
	password: Type.String({ minLength: 1 }),
});

/** Customer registration, `POST /user/register`. `locale` is the language of the mails. */
export const UserRegisterForm = Type.Object({
	name: Type.Optional(Type.String()),
	email: EMAIL,
	password: Type.String({ minLength: MIN_PASSWORD }),
	locale: Type.Optional(
		Type.Union([Type.Literal("ru"), Type.Literal("en"), Type.Literal("kk")]),
	),
});

/** Password reset request, `POST /user/forgot`. */
export const ForgotForm = Type.Object({ email: EMAIL });

/** New password with the mailed token, `POST /user/reset`. */
export const ResetForm = Type.Object({
	token: Type.String({ minLength: 1 }),
	password: Type.String({ minLength: MIN_PASSWORD }),
});
