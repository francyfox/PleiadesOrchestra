import type { ActionResult } from "#lib/api/result.js";
import {
	type ActionEnhanceOptions,
	useActionEnhance,
} from "#lib/components/use-action-enhance.js";

/** Webhook actions; the server's own message (unsafe URL, limit reached) is the error toast. */
export function useWebhookEnhance(
	run: (form: FormData) => Promise<ActionResult>,
	onSettled?: () => void,
	/** Only after a successful call (a failed submit keeps its dialog open with the input). */
	onDone?: (data: Record<string, unknown>) => void,
	validation?: Pick<ActionEnhanceOptions, "schema" | "overrides">,
	/** Skip the "Done" toast when the page shows the result itself (a new secret). */
	quiet = false,
) {
	return useActionEnhance({
		...validation,
		run,
		onSettled,
		onSuccess: (data) => onDone?.(data),
		quietSuccess: () => quiet,
	});
}
