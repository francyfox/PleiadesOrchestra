import { get } from "svelte/store";
import { useIntlayer } from "svelte-intlayer";
import { bulkEnhance } from "./bulk-enhance";

/**
 * `bulkEnhance` with localized toasts. Call during component init; texts
 * are read at submit time, so they follow a locale switch.
 */
export function useBulkEnhance(onSuccess?: () => void) {
	const content = useIntlayer("user-actions");
	return bulkEnhance({
		onSuccess,
		updatedText: (count) => String(get(content).updated({ count })),
		errorText: (data) => {
			const c = get(content);
			if (data?.error === "no_selection") return c.errors.no_selection.value;
			return typeof data?.message === "string" ? data.message : c.failed.value;
		},
	});
}
