import { get } from "svelte/store";
import { useIntlayer } from "svelte-intlayer";
import type { ActionResult } from "$lib/api/result";
import { useActionEnhance } from "$lib/components/use-action-enhance";

export function useBlockedIpEnhance(
	run: (form: FormData) => Promise<ActionResult>,
	onSettled?: () => void,
	/** Only after a successful call (e.g. close the dialog; a failed submit keeps it open with its input). */
	onDone?: () => void,
) {
	const content = useIntlayer("blocked-ips");
	return useActionEnhance({
		run,
		onSettled,
		onSuccess: () => onDone?.(),
		resetOnSuccess: true,
		errorText: (code) =>
			code === "invalid_block"
				? get(content).errors.invalid_block.value
				: undefined,
	});
}
