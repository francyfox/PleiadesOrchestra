import { get } from "svelte/store";
import { useIntlayer } from "svelte-intlayer";
import type { ActionResult } from "#lib/api/result.js";
import {
	type ActionEnhanceOptions,
	useActionEnhance,
} from "#lib/components/use-action-enhance.js";

const CODES = [
	"invalid_name",
	"invalid_email",
	"same_email",
	"confirm_mismatch",
	"too_many_attempts",
	"upstream_unavailable",
] as const;

/** Account settings forms: their error codes (incl. 429 `too_many_attempts`) localized. */
export function useSettingsEnhance(
	run: (form: FormData) => Promise<ActionResult>,
	options: Omit<ActionEnhanceOptions, "run" | "errorText"> = {},
) {
	const content = useIntlayer("settings");
	return useActionEnhance({
		...options,
		run,
		errorText: (code) => {
			const known = CODES.find((candidate) => candidate === code);
			return known ? get(content).errors[known].value : undefined;
		},
	});
}
