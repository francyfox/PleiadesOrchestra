import { get } from "svelte/store";
import { useIntlayer } from "svelte-intlayer";
import { useActionEnhance } from "$lib/components/use-action-enhance";

export function useBlockedIpEnhance() {
	const content = useIntlayer("blocked-ips");
	return useActionEnhance({
		resetOnSuccess: true,
		errorText: (code) =>
			code === "invalid_block"
				? get(content).errors.invalid_block.value
				: undefined,
	});
}
