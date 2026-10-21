import { get } from "svelte/store";
import { useIntlayer } from "svelte-intlayer";
import type { ActionResult } from "#lib/api/result.js";
import { useActionEnhance } from "#lib/components/use-action-enhance.js";

const CODES = [
	"billing_unavailable",
	"billing_failed",
	"upstream_unavailable",
] as const;

/** Checkout / portal forms: go to the Polar page they answer with; error codes localized. */
export function useBillingEnhance(
	run: (form: FormData) => Promise<ActionResult>,
	onUnavailable: () => void,
) {
	const content = useIntlayer("billing");
	return useActionEnhance({
		run,
		quietSuccess: () => true,
		onSuccess: (data) => window.location.assign(String(data.url)),
		errorText: (code) => {
			if (code === "billing_unavailable") onUnavailable();
			const known = CODES.find((candidate) => candidate === code);
			return known ? get(content).errors[known].value : undefined;
		},
	});
}
