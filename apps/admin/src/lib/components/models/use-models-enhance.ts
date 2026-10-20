import { get } from "svelte/store";
import { useIntlayer } from "svelte-intlayer";
import type { ActionResult } from "#lib/api/result.js";
import { useActionEnhance } from "#lib/components/use-action-enhance.js";

/** The Models tab's forms: `onDone` only after a success (a failed submit keeps the dialog open with its input). */
export function useModelsEnhance(
	run: (form: FormData) => Promise<ActionResult>,
	onDone?: () => void,
) {
	const content = useIntlayer("models");
	return useActionEnhance({
		run,
		onSuccess: () => onDone?.(),
		errorText: (code) =>
			code === "invalid_json"
				? get(content).errors.invalid_json.value
				: undefined,
	});
}
