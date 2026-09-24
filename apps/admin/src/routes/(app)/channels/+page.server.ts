import { fail } from "@sveltejs/kit";
import type { AccessMode } from "$lib/api-types";
import { orchestratorAs, orError, orFail } from "$lib/server/admin-api";
import { services } from "$lib/server/services";
import type { Actions, PageServerLoad } from "./$types";

const ACCESS_MODES: readonly AccessMode[] = ["open", "whitelist"];

/** One origin per line (or comma-separated), blanks dropped. */
function parseOrigins(value: FormDataEntryValue | null): string[] {
	return String(value ?? "")
		.split(/[\s,]+/)
		.map((origin) => origin.trim())
		.filter(Boolean);
}

export const load: PageServerLoad = async () => ({
	channels: (await orError(services().orchestrator.listChannels())).items,
});

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const form = await request.formData();
		const slug = String(form.get("slug") ?? "").trim();
		const name = String(form.get("name") ?? "").trim();
		const accessMode =
			ACCESS_MODES.find((mode) => mode === form.get("accessMode")) ?? "open";
		if (!/^[a-z0-9-]+$/.test(slug) || !name) {
			return fail(400, {
				message:
					"Slug — строчные латинские буквы, цифры и дефис; имя обязательно",
			});
		}
		const result = await orFail(
			orchestratorAs(locals).createChannel({
				slug,
				name,
				kind: "web",
				accessMode,
				allowedOrigins: parseOrigins(form.get("allowedOrigins")),
			}),
		);
		if ("status" in result) return result;
		return {
			secret: {
				channel: result.channel.name,
				secretKey: result.secretKey,
				publishableKey: result.channel.publishableKey,
			},
		};
	},
	update: async ({ request, locals }) => {
		const form = await request.formData();
		const id = String(form.get("id") ?? "");
		const accessMode = ACCESS_MODES.find(
			(mode) => mode === form.get("accessMode"),
		);
		const result = await orFail(
			orchestratorAs(locals).updateChannel(id, {
				name: String(form.get("name") ?? "").trim() || undefined,
				accessMode,
				allowedOrigins: form.has("allowedOrigins")
					? parseOrigins(form.get("allowedOrigins"))
					: undefined,
			}),
		);
		return "status" in result ? result : { updated: true };
	},
	toggle: async ({ request, locals }) => {
		const form = await request.formData();
		const result = await orFail(
			orchestratorAs(locals).updateChannel(String(form.get("id") ?? ""), {
				disabled: form.get("disabled") === "true",
			}),
		);
		return "status" in result ? result : { updated: true };
	},
	rotate: async ({ request, locals }) => {
		const form = await request.formData();
		const result = await orFail(
			orchestratorAs(locals).rotateChannelKeys(String(form.get("id") ?? "")),
		);
		if ("status" in result) return result;
		return {
			secret: {
				channel: result.channel.name,
				secretKey: result.secretKey,
				publishableKey: result.channel.publishableKey,
			},
		};
	},
};
