import type { Action } from "svelte/action";
import { get } from "svelte/store";
import { useIntlayer } from "svelte-intlayer";
import { toast } from "svelte-sonner";
import { invalidateAll } from "$app/navigation";
import type { ActionResult } from "$lib/api/result";

export interface ActionEnhanceOptions {
	/** Sends the form to admin-api (see `$lib/actions`). */
	run: (form: FormData) => Promise<ActionResult>;
	onSettled?: () => void;
	/** Runs on success with the response data (e.g. to show one-time keys). */
	onSuccess?: (data: Record<string, unknown>) => void;
	errorText?: (
		code: string,
		data: Record<string, unknown>,
	) => string | undefined;
	/** Text for the success toast; unset = a plain "Done". */
	successText?: (data: Record<string, unknown>) => string;
	/** Skip the "Done" toast for some successes (e.g. the page shows new keys instead). */
	quietSuccess?: (data: Record<string, unknown>) => boolean;
	/** Reset the form's inputs after a successful submit. */
	resetOnSuccess?: boolean;
}

/**
 * Turns a `<form>` into a call to admin-api (`use:submit`): a toast for
 * success, or the failure's localized error (`errorText(code)`) / the
 * upstream message, then `onSettled` (e.g. close a dialog) and a reload of
 * the page's data. The submit button's own `name`/`value` are part of the
 * form data, so several buttons can share one form. Call during component init.
 */
export function useActionEnhance(
	options: ActionEnhanceOptions,
): Action<HTMLFormElement> {
	const common = useIntlayer("common");

	return (form) => {
		let pending = false;

		async function onSubmit(event: SubmitEvent) {
			event.preventDefault();
			if (pending) return;
			pending = true;
			try {
				const result = await options.run(new FormData(form, event.submitter));
				const c = get(common);
				const data = result.data;
				if (!result.ok) {
					const localized =
						typeof data.error === "string"
							? options.errorText?.(data.error, data)
							: undefined;
					toast.error(
						localized ??
							(typeof data.message === "string"
								? data.message
								: c.failed.value),
					);
				} else {
					options.onSuccess?.(data);
					if (!options.quietSuccess?.(data)) {
						toast.success(options.successText?.(data) ?? c.done.value);
					}
				}
				options.onSettled?.();
				if (result.ok && options.resetOnSuccess) form.reset();
				await invalidateAll();
			} finally {
				pending = false;
			}
		}

		form.addEventListener("submit", onSubmit);
		return { destroy: () => form.removeEventListener("submit", onSubmit) };
	};
}
