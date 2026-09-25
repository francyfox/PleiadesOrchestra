import type { SubmitFunction } from "@sveltejs/kit";
import { toast } from "svelte-sonner";

/**
 * `use:enhance` handler for the users bulk action (the per-row buttons post
 * to the same action): toast on success/failure, then refresh the page data.
 */
export function bulkEnhance(options: {
	updatedText: (count: number) => string;
	errorText: (data: Record<string, unknown> | undefined) => string;
	onSuccess?: () => void;
}): SubmitFunction {
	return () =>
		async ({ result, update }) => {
			if (result.type === "success") {
				toast.success(options.updatedText(Number(result.data?.updated ?? 0)));
				options.onSuccess?.();
			} else if (result.type === "failure") {
				toast.error(options.errorText(result.data));
			}
			await update();
		};
}
