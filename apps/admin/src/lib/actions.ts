import type { AccessMode, BulkAction } from "$lib/api-types";
import { api } from "./api/client";
import { type ActionResult, submitted } from "./api/result";

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
const ACCESS_MODES: readonly AccessMode[] = ["open", "whitelist"];

/** One origin per line (or comma-separated), blanks dropped. */
export function parseOrigins(value: FormDataEntryValue | null): string[] {
	return String(value ?? "")
		.split(/[\s,]+/)
		.map((origin) => origin.trim())
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

export const authActions = {
	login: (form: FormData) =>
		submitted(
			api().auth.login.post({
				email: text(form, "email"),
				password: String(form.get("password") ?? ""),
			}),
		),
	register: (form: FormData) =>
		submitted(
			api().auth.register.post({
				name: text(form, "name") || undefined,
				email: text(form, "email"),
				password: String(form.get("password") ?? ""),
			}),
		),
	logout: () => submitted(api().auth.logout.post()),
};

export const adminActions = {
	create: (form: FormData) =>
		submitted(
			api().admins.post({
				name: text(form, "name") || undefined,
				email: text(form, "email"),
				password: String(form.get("password") ?? ""),
			}),
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
	setPassword: (form: FormData) =>
		submitted(
			api()
				.admins({ id: text(form, "id") })
				.password.post({ password: String(form.get("password") ?? "") }),
		),
	remove: (form: FormData) =>
		submitted(
			api()
				.admins({ id: text(form, "id") })
				.delete(),
		),
};

export const userActions = {
	/** The bulk bar and the per-row buttons post the same fields: `ids[]`, `action`, `reason`. */
	bulk: (form: FormData) => {
		const action = BULK_ACTIONS.find(
			(candidate) => candidate === form.get("action"),
		);
		const ids = form.getAll("ids").map(String).filter(Boolean);
		if (!action) return Promise.resolve<ActionResult>({ ok: false, data: {} });
		return submitted(
			api().users.bulk.post({
				ids,
				action,
				reason: text(form, "reason") || undefined,
			}),
		);
	},
	whitelist: (id: string) => submitted(api().users({ id }).whitelist.post()),
	unwhitelist: (id: string) =>
		submitted(api().users({ id }).unwhitelist.post()),
	block: (id: string, form: FormData) =>
		submitted(
			api()
				.users({ id })
				.block.post({ reason: text(form, "reason") || undefined }),
		),
	unblock: (id: string) => submitted(api().users({ id }).unblock.post()),
	deleteMessages: (id: string) =>
		submitted(api().users({ id }).messages.delete()),
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
