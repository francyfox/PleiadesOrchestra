import { get } from "svelte/store";
import { useIntlayer } from "svelte-intlayer";
import type { ActionResult } from "$lib/api/result";
import { useActionEnhance } from "$lib/components/use-action-enhance";

/** Admin account actions: validation/policy codes localized, forms reset on success. */
export function useAdminEnhance(
	run: (form: FormData) => Promise<ActionResult>,
	onSettled?: () => void,
	/** Only after a successful call (e.g. close the create dialog; a failed one stays open with its input). */
	onDone?: () => void,
) {
	const content = useIntlayer("admins");
	return useActionEnhance({
		run,
		onSettled,
		onSuccess: () => onDone?.(),
		resetOnSuccess: true,
		errorText: (code, data) => {
			const errors = get(content).errors;
			const min = Number(data.min ?? 8);
			switch (code) {
				case "weak_credentials":
					return String(errors.weak_credentials({ min }));
				case "weak_password":
					return String(errors.weak_password({ min }));
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
