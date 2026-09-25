import { get } from "svelte/store";
import { useIntlayer } from "svelte-intlayer";
import { useActionEnhance } from "$lib/components/use-action-enhance";

/** Channel form actions: localized validation errors; no toast when new keys are shown. */
export function useChannelEnhance(onSettled?: () => void) {
	const content = useIntlayer("channels");
	return useActionEnhance({
		onSettled,
		resetOnSuccess: true,
		quietSuccess: (data) => Boolean(data.secret),
		errorText: (code) =>
			code === "invalid_channel"
				? get(content).errors.invalid_channel.value
				: undefined,
	});
}
