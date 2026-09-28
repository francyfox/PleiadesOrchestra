import { get } from "svelte/store";
import { useIntlayer } from "svelte-intlayer";
import type { ActionResult } from "$lib/api/result";
import { useActionEnhance } from "$lib/components/use-action-enhance";

export function useBlockedIpEnhance(
	run: (form: FormData) => Promise<ActionResult>,
	onSettled?: () => void,
) {
	const content = useIntlayer("blocked-ips");
	return useActionEnhance({
		run,
		onSettled,
		resetOnSuccess: true,
		errorText: (code) =>
			code === "invalid_block"
				? get(content).errors.invalid_block.value
				: undefined,
	});
}
