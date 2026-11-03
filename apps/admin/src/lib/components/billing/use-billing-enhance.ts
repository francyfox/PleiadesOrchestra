import { get } from "svelte/store";
import { useIntlayer } from "svelte-intlayer";
import type { ActionResult } from "#lib/api/result.js";
import {
	type ActionEnhanceOptions,
	useActionEnhance,
} from "#lib/components/use-action-enhance.js";

const CODES = [
	"no_subscription",
	"billing_unavailable",
	"billing_failed",
	"upstream_unavailable",
] as const;

/** Checkout / portal forms: go to the Polar page they answer with; error codes localized. */
export function useBillingEnhance(
	run: (form: FormData) => Promise<ActionResult>,
	onUnavailable: () => void,
	/** Field validation, or `onSuccess` to stay on the page instead of following `url` (see `useActionEnhance`). */
	options?: Pick<
		ActionEnhanceOptions,
		"schema" | "overrides" | "onSuccess" | "successText"
	>,
) {
	const content = useIntlayer("billing");
	return useActionEnhance({
		run,
		quietSuccess: () => !options?.onSuccess,
		onSuccess: (data) => window.location.assign(String(data.url)),
		...options,
		errorText: (code) => {
			if (code === "billing_unavailable") onUnavailable();
			const known = CODES.find((candidate) => candidate === code);
			return known ? get(content).errors[known].value : undefined;
		},
	});
}
