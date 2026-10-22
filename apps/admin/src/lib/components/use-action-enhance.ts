import type { TObject } from "@sinclair/typebox";
import { createMutation } from "@tanstack/svelte-query";
import type { Action } from "svelte/action";
import { get, writable } from "svelte/store";
import { useIntlayer } from "svelte-intlayer";
import { toast } from "svelte-sonner";
import type { ActionResult } from "#lib/api/result.js";
import { type FieldError, validateForm } from "#lib/forms/field-errors.js";
import type { FieldOverrides } from "#lib/forms/schema-to-zod.js";
import { queryClient } from "#lib/query/client.js";

export interface ActionEnhanceOptions {
	/** Sends the form to admin-api (see `#lib/actions.js`). */
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
	/** Validate the form against this `admin-api/forms` schema first; on errors nothing is sent and `.errors` is set. */
	schema?: TObject;
	/** Readers for fields whose input differs from the wire value (see `FieldOverrides`); pass the same to `parseForm` in the action. */
	overrides?: FieldOverrides;
}

/**
 * Turns a `<form>` into a call to admin-api (`use:submit`): a toast for
 * success, or the failure's localized error (`errorText(code)`) / the
 * upstream message, then `onSettled` (e.g. close a dialog) and a refresh of
 * the data on screen (the request is a TanStack mutation; every cached query
 * is invalidated, the ones in view refetch). The submit button's own `name`/`value` are part of the
 * form data, so several buttons can share one form. Call during component init.
 *
 * With `schema`, the returned action also carries `errors` (a store of one
 * `FieldError` per field name, undefined = none; read it as `$errors`) and
 * `clear(name)`. An `input`/`change` in a field clears its error.
 */
export function useActionEnhance(options: ActionEnhanceOptions) {
	const errors = writable<Record<string, FieldError> | undefined>();
	const clear = (name: string) =>
		errors.update((e) => {
			if (!e || !(name in e)) return e;
			const { [name]: _, ...rest } = e;
			return Object.keys(rest).length ? rest : undefined;
		});
	const common = useIntlayer("common");
	const mutation = createMutation(() => ({
		mutationFn: options.run,
	}));

	const action: Action<HTMLFormElement> = (form) => {
		errors.set(undefined);
		const onField = (event: Event) => {
			if (event.target instanceof HTMLElement && "name" in event.target)
				clear(String(event.target.name));
		};
		async function onSubmit(event: SubmitEvent) {
			event.preventDefault();
			if (mutation.isPending) return;
			const body = new FormData(form, event.submitter);
			if (options.schema) {
				const found = validateForm(options.schema, body, options.overrides);
				errors.set(found);
				if (found) return;
			}
			const result = await mutation.mutateAsync(body);
			const c = get(common);
			const data = result.data;
			if (!result.ok) {
				const localized =
					typeof data.error === "string"
						? options.errorText?.(data.error, data)
						: undefined;
				toast.error(
					localized ??
						(typeof data.message === "string" ? data.message : c.failed.value),
				);
			} else {
				options.onSuccess?.(data);
				if (!options.quietSuccess?.(data)) {
					toast.success(options.successText?.(data) ?? c.done.value);
				}
			}
			options.onSettled?.();
			if (result.ok && options.resetOnSuccess) form.reset();
			await queryClient.invalidateQueries();
		}

		form.addEventListener("submit", onSubmit);
		form.addEventListener("input", onField);
		form.addEventListener("change", onField);
		return {
			destroy: () => {
				form.removeEventListener("submit", onSubmit);
				form.removeEventListener("input", onField);
				form.removeEventListener("change", onField);
			},
		};
	};
	return Object.assign(action, { errors, clear });
}
