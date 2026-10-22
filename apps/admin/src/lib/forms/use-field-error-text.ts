import { derived, type Readable } from "svelte/store";
import { useIntlayer } from "svelte-intlayer";
import type { FieldError } from "./field-errors.ts";

type ErrorText = (error?: FieldError) => string | undefined;

/** Store of `(error) => localized text`; use as `$errorText(errors?.name)` (undefined in, undefined out). */
export function useFieldErrorText(): Readable<ErrorText> {
	// biome-ignore lint/suspicious/noExplicitAny: the intlayer store is typed `Readable<any>`, which makes `derived` infer `unknown`.
	return derived<Readable<any>, ErrorText>(useIntlayer("common"), ($common) => {
		const e = $common.fieldError;
		return (error?: FieldError) => {
			if (!error) return undefined;
			const count = error.limit ?? 0;
			switch (error.code) {
				case "required":
					return e.required.value;
				case "too_short":
					return e.tooShort({ count });
				case "too_long":
					return e.tooLong({ count });
				case "pattern":
					return e.pattern.value;
				case "too_small":
					return e.tooSmall({ count });
				case "too_big":
					return e.tooBig({ count });
				default:
					return e.invalid.value;
			}
		};
	});
}
