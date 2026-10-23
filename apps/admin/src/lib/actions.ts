import type { Static, TObject } from "@sinclair/typebox";
import {
	AgentPick,
	ChangeEmailInput,
	CreateAdminInput,
	CreateBlockedIpInput,
	CreateChannelForm,
	DeleteMeInput,
	EditAdminForm,
	ForgotForm,
	IntentVerdictInput,
	PersonaForm,
	ProviderForm,
	ProviderModel,
	ResetForm,
	TokenLoginForm,
	TopUpForm,
	UpdateChannelForm,
	UpdateMeInput,
	UserLoginForm,
	UserRegisterForm,
} from "admin-api/forms";
import type { BulkAction } from "#lib/api-types.js";
import { api } from "./api/client";
import { type ActionResult, submitted } from "./api/result";
import { parseForm } from "./forms/field-errors";
import type { FieldOverrides } from "./forms/schema-to-zod";
import { queryClient } from "./query/client";

/**
 * What the panel's forms do: read the fields, call admin-api, hand back an
 * `ActionResult` for `useActionEnhance` to toast. (These were SvelteKit form
 * actions in `+page.server.ts` before the backend moved to admin-api.)
 * Validation and its error codes live server-side; nothing here is authoritative.
 */

const text = (form: FormData, name: string) =>
	String(form.get(name) ?? "").trim();

const BULK_ACTIONS: readonly BulkAction[] = [
	"whitelist",
	"unwhitelist",
	"block",
	"unblock",
];

/** One origin per line (or comma-separated), blanks dropped. */
export function parseOrigins(value: FormDataEntryValue | null): string[] {
	return String(value ?? "")
		.split(/[\s,]+/)
		.map((origin) => origin.trim())
		.filter(Boolean);
}

/** One entry per line, blanks dropped. */
export function lines(value: FormDataEntryValue | null): string[] {
	return String(value ?? "")
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean);
}

/** Keys handed out once by create / rotate, for the "copy them now" card. */
function withSecret(result: ActionResult): ActionResult {
	if (!result.ok) return result;
	const { channel, secretKey } = result.data as {
		channel: { name: string; publishableKey: string | null };
		secretKey: string;
	};
	return {
		ok: true,
		data: {
			secret: {
				channel: channel.name,
				secretKey,
				publishableKey: channel.publishableKey,
			},
		},
	};
}

/**
 * Signing in starts a new session: whatever the query cache holds belongs to
 * the previous one (another admin, or the same one before a lapse), so it is
 * emptied on success — from the login page, where nothing reads it.
 */
async function startsSession(result: Promise<ActionResult>) {
	const settled = await result;
	if (settled.ok) queryClient.clear();
	return settled;
}

/** A password is sent as typed: `parseForm` would trim it. */
export const passwordAsTyped: FieldOverrides = {
	password: (form) => String(form.get("password") ?? "") || undefined,
};

/** Auth forms are validated by `useAuthForm` first (same cached parse); `invalidForm` only guards a skipped check. */
export const authActions = {
	/** Staff: the access token from the super admin. */
	tokenLogin: (form: FormData) => {
		const parsed = parseForm(TokenLoginForm, form);
		if (!parsed.ok) return invalidForm();
		return startsSession(submitted(api().auth.token.post(parsed.body)));
	},
	userLogin: (form: FormData) => {
		const parsed = parseForm(UserLoginForm, form, passwordAsTyped);
		if (!parsed.ok) return invalidForm();
		return startsSession(submitted(api().user.login.post(parsed.body)));
	},
	userRegister: (form: FormData) => {
		const parsed = parseForm(UserRegisterForm, form, passwordAsTyped);
		if (!parsed.ok) return invalidForm();
		return submitted(api().user.register.post(parsed.body));
	},
	resend: (email: string) => submitted(api().user.resend.post({ email })),
	forgot: (form: FormData) => {
		const parsed = parseForm(ForgotForm, form);
		if (!parsed.ok) return invalidForm();
		return submitted(api().user.forgot.post(parsed.body));
	},
	reset: (form: FormData) => {
		const parsed = parseForm(ResetForm, form, passwordAsTyped);
		if (!parsed.ok) return invalidForm();
		return submitted(api().user.reset.post(parsed.body));
	},
	logout: () => submitted(api().auth.logout.post()),
};

/** A blank name is allowed (the server falls back to the email), so it is sent as "" instead of being "required". */
export const adminOverrides = { name: (form: FormData) => text(form, "name") };

export const adminActions = {
	create: (form: FormData) => {
		const parsed = parseForm(CreateAdminInput, form, adminOverrides);
		if (!parsed.ok) return invalidForm();
		return submitted(api().admins.post(parsed.body));
	},
	edit: (form: FormData) => {
		const parsed = parseForm(EditAdminForm, form, adminOverrides);
		if (!parsed.ok) return invalidForm();
		const { id, ...body } = parsed.body;
		return submitted(api().admins({ id }).patch(body));
	},
	rotateToken: (form: FormData) =>
		submitted(
			api()
				.admins({ id: text(form, "id") })
				.token.post(),
		),
	ban: (form: FormData) =>
		submitted(
			api()
				.admins({ id: text(form, "id") })
				.ban.post({ reason: text(form, "reason") || undefined }),
		),
	unban: (form: FormData) =>
		submitted(
			api()
				.admins({ id: text(form, "id") })
				.unban.post(),
		),
	remove: (form: FormData) =>
		submitted(
			api()
				.admins({ id: text(form, "id") })
				.delete(),
		),
};

/** The signed-in customer's own account (`/api/user/me*`). */
export const meActions = {
	rename: (form: FormData) => {
		const parsed = parseForm(UpdateMeInput, form);
		if (!parsed.ok) return invalidForm();
		return submitted(api().user.me.patch(parsed.body));
	},
	changeEmail: (form: FormData) => {
		const parsed = parseForm(ChangeEmailInput, form);
		if (!parsed.ok) return invalidForm();
		return submitted(api().user.me.email.post(parsed.body));
	},
	/** The server re-checks `confirmEmail`; the sessions die with the account, so there is no sign-out call. */
	remove: (form: FormData) => {
		const parsed = parseForm(DeleteMeInput, form);
		if (!parsed.ok) return invalidForm();
		return submitted(api().user.me.delete(parsed.body));
	},
};

/** Polar checkout and customer portal; both answer `{ url }` to go to. */
export const billingActions = {
	subscribe: () => submitted(api().billing.checkout.post({ kind: "plan" })),
	topUp: (form: FormData) => {
		const parsed = parseForm(TopUpForm, form);
		if (!parsed.ok) return invalidForm();
		return submitted(api().billing.checkout.post(parsed.body));
	},
	portal: () => submitted(api().billing.portal.post()),
};

/** Staff managing customer accounts (`/api/accounts`). */
export const accountActions = {
	ban: (form: FormData) =>
		submitted(
			api()
				.accounts({ id: text(form, "id") })
				.ban.post(),
		),
	unban: (form: FormData) =>
		submitted(
			api()
				.accounts({ id: text(form, "id") })
				.unban.post(),
		),
	remove: (form: FormData) =>
		submitted(
			api()
				.accounts({ id: text(form, "id") })
				.delete(),
		),
};

export const visitorActions = {
	/** The bulk bar and the per-row buttons post the same fields: `ids[]`, `action`, `reason`. */
	bulk: (form: FormData) => {
		const action = BULK_ACTIONS.find(
			(candidate) => candidate === form.get("action"),
		);
		const ids = form.getAll("ids").map(String).filter(Boolean);
		if (!action) return Promise.resolve<ActionResult>({ ok: false, data: {} });
		return submitted(
			api().visitors.bulk.post({
				ids,
				action,
				reason: text(form, "reason") || undefined,
			}),
		);
	},
	whitelist: (id: string) => submitted(api().visitors({ id }).whitelist.post()),
	unwhitelist: (id: string) =>
		submitted(api().visitors({ id }).unwhitelist.post()),
	block: (id: string, form: FormData) =>
		submitted(
			api()
				.visitors({ id })
				.block.post({ reason: text(form, "reason") || undefined }),
		),
	unblock: (id: string) => submitted(api().visitors({ id }).unblock.post()),
	deleteMessages: (id: string) =>
		submitted(api().visitors({ id }).messages.delete()),
};

/** A person's verdict on a learned example: approve, reject, or a corrected intent (which approves it). */
export const intentActions = {
	judge: (form: FormData) => {
		const parsed = parseForm(IntentVerdictInput, form);
		if (!parsed.ok) return invalidForm();
		return submitted(
			api()
				.intents({ id: text(form, "id") })
				.patch(parsed.body),
		);
	},
};

/** UI vs wire: origins are typed as text (one per line or comma-separated), and only a form that has the field sends it. */
export const channelOverrides: FieldOverrides = {
	allowedOrigins: (form) =>
		form.has("allowedOrigins")
			? parseOrigins(form.get("allowedOrigins"))
			: undefined,
	// Unticked boxes send nothing, so a form that shows the field says so: no ticks then means an empty list.
	intentSets: (form) =>
		form.has("intentSetsShown")
			? form.getAll("intentSets").map(String)
			: undefined,
};

/** UI vs wire: an empty persona field is a real value ("not set"), not a missing one; topics are a text, one per line. */
export const personaOverrides: FieldOverrides = {
	...Object.fromEntries(
		["botName", "tone", "defaultLang", "greeting", "handoffContact"].map(
			(name) => [name, (form: FormData) => text(form, name)],
		),
	),
	instructions: (form) => String(form.get("instructions") ?? ""),
	forbiddenTopics: (form) => lines(form.get("forbiddenTopics")),
};

const run = <T extends TObject>(
	schema: T,
	form: FormData,
	send: (body: Static<T>) => Parameters<typeof submitted>[0],
	overrides = channelOverrides,
) => {
	const parsed = parseForm(schema, form, overrides);
	return parsed.ok ? submitted(send(parsed.body)) : invalidForm();
};

export const channelActions = {
	create: async (form: FormData) =>
		withSecret(
			await run(CreateChannelForm, form, (body) => api().channels.post(body)),
		),
	update: (form: FormData) =>
		run(UpdateChannelForm, form, ({ id, ...body }) =>
			api().channels({ id }).patch(body),
		),
	savePersona: (form: FormData) =>
		run(
			PersonaForm,
			form,
			({ id, ...body }) => api().channels({ id }).persona.put(body),
			personaOverrides,
		),
	toggle: (form: FormData) =>
		submitted(
			api()
				.channels({ id: text(form, "id") })
				.patch({ disabled: form.get("disabled") === "true" }),
		),
	rotate: async (form: FormData) =>
		withSecret(
			await submitted(
				api()
					.channels({ id: text(form, "id") })
					["rotate-keys"].post(),
			),
		),
};

export const blockedIpActions = {
	create: (form: FormData) => {
		const parsed = parseForm(CreateBlockedIpInput, form);
		if (!parsed.ok) return invalidForm();
		return submitted(api()["blocked-ips"].post(parsed.body));
	},
	remove: (form: FormData) =>
		submitted(
			api()
				["blocked-ips"]({ id: text(form, "id") })
				.delete(),
		),
};

/** Only for a handler run without `useActionEnhance({ schema })` validating first. */
const invalidForm = () =>
	Promise.resolve<ActionResult>({ ok: false, data: { error: "invalid_form" } });

/** The select's value is "<provider>\t<model id>" (a model id may hold "/" or ":"); the wire body is { provider, model }. */
const pickPart = (index: 0 | 1) => (form: FormData) =>
	text(form, "model").split("\t")[index] ?? "";
export const agentPickOverrides: FieldOverrides = {
	provider: pickPart(0),
	model: pickPart(1),
};

export const agentActions = {
	save: (form: FormData) => {
		const parsed = parseForm(AgentPick, form, agentPickOverrides);
		if (!parsed.ok) return invalidForm();
		return submitted(
			api()
				.agents({ id: text(form, "id") })
				.model.put(parsed.body),
		);
	},
	/** The call itself can fail with a 200 (`ok: false`); that is a failure for the panel too. */
	test: async (form: FormData) => {
		const result = await submitted(
			api()
				.agents({ id: text(form, "id") })
				.test.post(),
		);
		return result.ok && result.data.ok === false
			? {
					ok: false as const,
					data: { message: String(result.data.error ?? "") },
				}
			: result;
	},
};

/** providers.toml through its forms and its editor. */
export const providerActions = {
	/** An empty key field keeps the saved key. */
	/** Left-out key / decisions URL keep the saved ones (empty inputs are omitted by `parseForm`). */
	save: (form: FormData) => {
		const parsed = parseForm(ProviderForm, form);
		if (!parsed.ok) return invalidForm();
		const { id, ...body } = parsed.body;
		return submitted(api().providers({ id }).put(body));
	},
	remove: (form: FormData) =>
		submitted(
			api()
				.providers({ id: text(form, "id") })
				.delete(),
		),
	saveModel: async (form: FormData) => {
		const parsed = parseForm(ProviderModel, form);
		if (!parsed.ok) return invalidForm();
		const model = parsed.body;
		const result = await submitted(
			api()
				.providers({ id: text(form, "provider") })
				.models.put(model),
		);
		// An edit that picked another provider moves the model: drop it from the old one.
		const from = text(form, "fromProvider");
		if (!result.ok || !from || from === text(form, "provider")) return result;
		return submitted(
			api()
				.providers({ id: from })
				.models.delete({}, { query: { model: model.id } }),
		);
	},
	removeModel: (form: FormData) =>
		submitted(
			api()
				.providers({ id: text(form, "provider") })
				.models.delete({}, { query: { model: text(form, "model") } }),
		),
	saveToml: (form: FormData) =>
		submitted(
			api()["providers-toml"].put({ toml: String(form.get("toml") ?? "") }),
		),
};
