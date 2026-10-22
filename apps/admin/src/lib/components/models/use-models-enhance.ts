import type { TObject } from "@sinclair/typebox";
import type { ActionResult } from "#lib/api/result.js";
import { useActionEnhance } from "#lib/components/use-action-enhance.js";

/** The Models tab's forms: `onDone` only after a success (a failed submit keeps the dialog open with its input). */
export function useModelsEnhance(
	run: (form: FormData) => Promise<ActionResult>,
	onDone?: () => void,
	schema?: TObject,
) {
	return useActionEnhance({
		run,
		schema,
		onSuccess: () => onDone?.(),
	});
}
