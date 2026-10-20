import { get } from "svelte/store";
import { useIntlayer } from "svelte-intlayer";
import type { ActionResult } from "#lib/api/result.js";
import { useActionEnhance } from "#lib/components/use-action-enhance.js";

/** Staff actions on customer accounts: localized error codes. */
export function useUserEnhance(
	run: (form: FormData) => Promise<ActionResult>,
	onSettled?: () => void,
) {
	const content = useIntlayer("users");
	return useActionEnhance({
		run,
		onSettled,
		errorText: (code) =>
			code === "not_found" || code === "upstream_unavailable"
				? get(content).errors[code].value
				: undefined,
	});
}
