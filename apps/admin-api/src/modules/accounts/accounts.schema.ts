import { type Static, t } from "elysia";

/** Account levels: a lower number can do more. Checks are `<=`, so a role can slot in between later. */
export const LEVEL = { super: 0, admin: 100, user: 200 } as const;

/** Staff = super admin and admins. */
export const isStaff = (level: number) => level <= LEVEL.admin;

/** Extra columns on better-auth's `user` table. Shared by `auth.ts` and `auth-cli.ts` (schema generation). */
export const accountFields = {
	level: {
		type: "number",
		required: true,
		defaultValue: LEVEL.user,
		input: false,
	},
	lastActiveAt: { type: "date", required: false, input: false },
	/** SHA-256 hex of the staff access token; never leaves the server. */
	tokenHash: {
		type: "string",
		required: false,
		input: false,
		returned: false,
	},
	/** Language of the mails sent to the account. */
	locale: { type: "string", required: false, input: true },
} as const;

export const Locale = t.Union([
	t.Literal("ru"),
	t.Literal("en"),
	t.Literal("kk"),
]);
export type Locale = Static<typeof Locale>;

export const UserLogin = t.Object({ email: t.String(), password: t.String() });

export const UserRegistration = t.Composite([
	UserLogin,
	t.Object({ name: t.Optional(t.String()), locale: t.Optional(Locale) }),
]);

export const ForgotInput = t.Object({ email: t.String() });

export const ResetInput = t.Object({ token: t.String(), password: t.String() });

/** The signed-in account for the user pages. */
export const Me = t.Object({
	id: t.String(),
	name: t.String(),
	email: t.String(),
	level: t.Number(),
	/** Epoch ms of the last authenticated request (written at most once a day); null = never. The panel shows the 180-day inactivity note from it. */
	lastActiveAt: t.Nullable(t.Number()),
});

export const UpdateMeInput = t.Object({ name: t.String() });

export const ChangeEmailInput = t.Object({ email: t.String() });

export const DeleteMeInput = t.Object({ confirmEmail: t.String() });

export type Me = Static<typeof Me>;
