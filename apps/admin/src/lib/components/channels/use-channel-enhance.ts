import { get } from "svelte/store";
import { useIntlayer } from "svelte-intlayer";
import type { ActionResult } from "$lib/api/result";
import { useActionEnhance } from "$lib/components/use-action-enhance";
import { type IssuedSecret, issued } from "./issued-secret.svelte";

/** Channel forms: localized validation errors; no toast when new keys are shown instead. */
export function useChannelEnhance(
	run: (form: FormData) => Promise<ActionResult>,
	onSettled?: () => void,
) {
	const content = useIntlayer("channels");
	return useActionEnhance({
		run,
		onSettled,
		resetOnSuccess: true,
		onSuccess: (data) => {
			if (data.secret) issued.current = data.secret as IssuedSecret;
		},
		quietSuccess: (data) => Boolean(data.secret),
		errorText: (code) =>
			code === "invalid_channel"
				? get(content).errors.invalid_channel.value
				: undefined,
	});
}
