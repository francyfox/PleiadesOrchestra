import { get } from "svelte/store";
import { useIntlayer } from "svelte-intlayer";
import { userActions } from "$lib/actions";
import { useActionEnhance } from "$lib/components/use-action-enhance";

/**
 * The users bulk action (the per-row buttons use it too): toast the number of
 * updated users, or the localized failure. Call during component init; texts
 * are read at submit time, so they follow a locale switch.
 */
export function useBulkEnhance(onSuccess?: () => void) {
	const content = useIntlayer("user-actions");
	return useActionEnhance({
		run: userActions.bulk,
		onSuccess: () => onSuccess?.(),
		successText: (data) =>
			String(get(content).updated({ count: Number(data.updated ?? 0) })),
		errorText: (code) =>
			code === "no_selection"
				? get(content).errors.no_selection.value
				: undefined,
	});
}
