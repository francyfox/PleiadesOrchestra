import type { SubmitFunction } from "@sveltejs/kit";
import { get } from "svelte/store";
import { useIntlayer } from "svelte-intlayer";
import { toast } from "svelte-sonner";

/**
 * `use:enhance` for simple form actions: a "Done" toast, or the failure's
 * localized error (`errorText(code)`) / raw orchestrator message, then
 * `onSettled` (e.g. close a dialog) and a data refresh. Call during init.
 */
export function useActionEnhance(
	options: {
		onSettled?: () => void;
		errorText?: (
			code: string,
			data: Record<string, unknown>,
		) => string | undefined;
		/** Skip the "Done" toast for some successes (e.g. the page shows new keys instead). */
		quietSuccess?: (data: Record<string, unknown>) => boolean;
		/** Reset the form's inputs after a successful submit. */
		resetOnSuccess?: boolean;
	} = {},
): SubmitFunction {
	const common = useIntlayer("common");
	return () =>
		async ({ result, update }) => {
			const c = get(common);
			if (result.type === "failure") {
				const data = result.data ?? {};
				const localized =
					typeof data.error === "string"
						? options.errorText?.(data.error, data)
						: undefined;
				toast.error(
					localized ??
						(typeof data.message === "string" ? data.message : c.failed.value),
				);
			} else if (
				result.type === "success" &&
				!options.quietSuccess?.(result.data ?? {})
			) {
				toast.success(c.done.value);
			}
			options.onSettled?.();
			await update({
				reset: options.resetOnSuccess === true && result.type === "success",
			});
		};
}
