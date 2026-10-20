import { get } from "svelte/store";
import { useIntlayer } from "svelte-intlayer";
import type { ActionResult } from "#lib/api/result.js";
import { useActionEnhance } from "#lib/components/use-action-enhance.js";

/** Admin account actions: validation/policy codes localized, forms reset on success. */
export function useAdminEnhance(
	run: (form: FormData) => Promise<ActionResult>,
	onSettled?: () => void,
	/** Only after a successful call (e.g. close the create dialog; a failed one stays open with its input). */
	onDone?: (data: Record<string, unknown>) => void,
) {
	const content = useIntlayer("admins");
	return useActionEnhance({
		run,
		onSettled,
		onSuccess: (data) => onDone?.(data),
		resetOnSuccess: true,
		errorText: (code) => {
			const errors = get(content).errors;
			switch (code) {
				case "invalid_email":
				case "email_taken":
				case "self":
				case "last_admin":
				case "not_super":
				case "super_protected":
				case "not_found":
					return errors[code].value;
				default:
					return undefined;
			}
		},
	});
}
