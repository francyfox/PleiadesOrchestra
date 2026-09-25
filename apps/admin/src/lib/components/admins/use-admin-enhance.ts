import { get } from "svelte/store";
import { useIntlayer } from "svelte-intlayer";
import { useActionEnhance } from "$lib/components/use-action-enhance";

/** Admin account actions: validation/policy codes localized, forms reset on success. */
export function useAdminEnhance(onSettled?: () => void) {
	const content = useIntlayer("admins");
	return useActionEnhance({
		onSettled,
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
					return errors[code].value;
				default:
					return undefined;
			}
		},
	});
}
