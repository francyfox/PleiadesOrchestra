import type { AccessMode, BulkAction } from "#lib/api-types.js";
import { api } from "./api/client";
import { type ActionResult, submitted } from "./api/result";
import { REQUEST_INTENTS } from "./flow-filters";
import { providerModelFromForm } from "./provider-model-form";
import { queryClient } from "./query/client";

/**
 * What the panel's forms do: read the fields, call admin-api, hand back an
 * `ActionResult` for `useActionEnhance` to toast. (These were SvelteKit form
 * actions in `+page.server.ts` before the backend moved to admin-api.)
 * Validation and its error codes live server-side; nothing here is authoritative.
 */

const text = (form: FormData, name: string) =>
	String(form.get(name) ?? "").trim();

const LOCALES = ["ru", "en", "kk"] as const;
const BULK_ACTIONS: readonly BulkAction[] = [
	"whitelist",
	"unwhitelist",
	"block",
	"unblock",
];
const ACCESS_MODES: readonly AccessMode[] = ["open", "whitelist"];

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

const accessMode = (form: FormData) =>
	ACCESS_MODES.find((mode) => mode === form.get("accessMode"));

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

export const authActions = {
	/** Staff: the access token from the super admin. */
	tokenLogin: (form: FormData) =>
		startsSession(
			submitted(api().auth.token.post({ token: text(form, "token") })),
		),
	userLogin: (form: FormData) =>
		startsSession(
			submitted(
				api().user.login.post({
					email: text(form, "email"),
					password: String(form.get("password") ?? ""),
				}),
			),
		),
	userRegister: (form: FormData) =>
		submitted(
			api().user.register.post({
				name: text(form, "name") || undefined,
				email: text(form, "email"),
				password: String(form.get("password") ?? ""),
				locale: LOCALES.find((locale) => locale === form.get("locale")),
			}),
		),
	resend: (email: string) => submitted(api().user.resend.post({ email })),
	forgot: (form: FormData) =>
		submitted(api().user.forgot.post({ email: text(form, "email") })),
	reset: (form: FormData) =>
		submitted(
			api().user.reset.post({
				token: text(form, "token"),
				password: String(form.get("password") ?? ""),
			}),
		),
	logout: () => submitted(api().auth.logout.post()),
};

export const adminActions = {
	create: (form: FormData) =>
		submitted(
			api().admins.post({
				name: text(form, "name"),
				email: text(form, "email"),
			}),
		),
	edit: (form: FormData) =>
		submitted(
			api()
				.admins({ id: text(form, "id") })
				.patch({ name: text(form, "name"), email: text(form, "email") }),
		),
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
	rename: (form: FormData) =>
		submitted(api().user.me.patch({ name: text(form, "name") })),
	changeEmail: (form: FormData) =>
		submitted(api().user.me.email.post({ email: text(form, "email") })),
	/** The server re-checks `confirmEmail`; the sessions die with the account, so there is no sign-out call. */
	remove: (form: FormData) =>
		submitted(
			api().user.me.delete({ confirmEmail: text(form, "confirmEmail") }),
		),
};

/** Polar checkout and customer portal; both answer `{ url }` to go to. */
export const billingActions = {
	checkout: (form: FormData) => {
		const kind = form.get("kind") === "credits" ? "credits" : "plan";
		return submitted(
			api().billing.checkout.post({
				kind,
				amountUsd:
					kind === "credits" ? Number(form.get("amountUsd")) : undefined,
			}),
		);
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

const INTENT_STATUSES = ["pending", "approved", "rejected"] as const;

/** A person's verdict on a learned example: approve, reject, or a corrected intent (which approves it). */
export const intentActions = {
	judge: (form: FormData) =>
		submitted(
			api()
				.intents({ id: text(form, "id") })
				.patch({
					status: INTENT_STATUSES.find(
						(status) => status === form.get("status"),
					),
					intent: REQUEST_INTENTS.find(
						(intent) => intent === form.get("intent"),
					),
				}),
		),
};

export const channelActions = {
	create: async (form: FormData) =>
		withSecret(
			await submitted(
				api().channels.post({
					slug: text(form, "slug"),
					name: text(form, "name"),
					accessMode: accessMode(form),
					allowedOrigins: parseOrigins(form.get("allowedOrigins")),
					catalogLanguage: text(form, "catalogLanguage") || undefined,
				}),
			),
		),
	update: (form: FormData) =>
		submitted(
			api()
				.channels({ id: text(form, "id") })
				.patch({
					name: text(form, "name") || undefined,
					accessMode: accessMode(form),
					allowedOrigins: form.has("allowedOrigins")
						? parseOrigins(form.get("allowedOrigins"))
						: undefined,
					catalogLanguage: text(form, "catalogLanguage") || undefined,
				}),
		),
	savePersona: (form: FormData) =>
		submitted(
			api()
				.channels({ id: text(form, "id") })
				.persona.put({
					botName: text(form, "botName"),
					tone: text(form, "tone"),
					instructions: String(form.get("instructions") ?? ""),
					defaultLang: text(form, "defaultLang"),
					greeting: text(form, "greeting"),
					forbiddenTopics: lines(form.get("forbiddenTopics")),
					handoffContact: text(form, "handoffContact"),
				}),
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
	create: (form: FormData) =>
		submitted(
			api()["blocked-ips"].post({
				ip: text(form, "ip"),
				reason: text(form, "reason"),
				expiresInHours: Number(form.get("expiresInHours")),
				channelId: text(form, "channelId") || undefined,
			}),
		),
	remove: (form: FormData) =>
		submitted(
			api()
				["blocked-ips"]({ id: text(form, "id") })
				.delete(),
		),
};

const invalidJson = () =>
	Promise.resolve<ActionResult>({ ok: false, data: { error: "invalid_json" } });

export const agentActions = {
	/** `model` = "<provider>\t<model id>" (a model id may hold "/" or ":"). */
	save: (form: FormData) => {
		const [provider = "", model = ""] = text(form, "model").split("\t");
		return submitted(
			api()
				.agents({ id: text(form, "id") })
				.model.put({ provider, model }),
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
	save: (form: FormData) => {
		const apiKey = text(form, "apiKey");
		const decisionsUrl = text(form, "decisionsUrl");
		return submitted(
			api()
				.providers({ id: text(form, "id") })
				.put({
					name: text(form, "name"),
					baseUrl: text(form, "baseUrl"),
					...(decisionsUrl ? { decisionsUrl } : {}),
					...(apiKey ? { apiKey } : {}),
				}),
		);
	},
	remove: (form: FormData) =>
		submitted(
			api()
				.providers({ id: text(form, "id") })
				.delete(),
		),
	saveModel: async (form: FormData) => {
		const model = providerModelFromForm(form);
		if (!model) return invalidJson();
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
