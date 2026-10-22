import type { TObject } from "@sinclair/typebox";
import type { ActionResult } from "#lib/api/result.js";
import { type FieldError, validateForm } from "#lib/forms/field-errors.js";
import type { FieldOverrides } from "#lib/forms/schema-to-zod.js";

const CODES = [
	"missing_credentials",
	"invalid_credentials",
	"invalid_token",
	"banned",
	"email_not_verified",
	"invalid_email",
	"too_many_attempts",
	"signup_failed",
] as const;

interface Text {
	value: string;
}

/** The `errors` of the `auth` dictionary (`$content.errors`). */
export interface AuthErrors {
	weak_credentials(values: { min: number }): unknown;
	weak_password(values: { min: number }): unknown;
	failed: Text;
	missing_credentials: Text;
	invalid_credentials: Text;
	invalid_token: Text;
	banned: Text;
	email_not_verified: Text;
	invalid_email: Text;
	too_many_attempts: Text;
	signup_failed: Text;
}

/** Localized text of a failed call's data (`{ error: code, min? }`); unknown codes read as a generic failure. */
export function authErrorText(
	errors: AuthErrors,
	failure: Record<string, unknown>,
): string {
	const min = Number(failure.min ?? 12);
	if (failure.error === "weak_credentials")
		return String(errors.weak_credentials({ min }));
	if (failure.error === "weak_password")
		return String(errors.weak_password({ min }));
	const known = CODES.find((code) => code === failure.error);
	return known ? errors[known].value : errors.failed.value;
}

/**
 * State of an auth page form: `submit` runs the action; `failure` is the
 * failed call's data (turn it into text with `authErrorText`); `done` flips on
 * success unless `onOk` is given (e.g. to navigate); `email` is the submitted
 * address, for "we sent a link to …". With `schema` the form is validated
 * first: nothing is sent on errors, `errors` holds one per field and an
 * `input` clears that field's. Call during component init.
 */
export function useAuthForm(
	run: (form: FormData) => Promise<ActionResult>,
	onOk?: () => void | Promise<void>,
	check?: { schema: TObject; overrides?: FieldOverrides },
) {
	let pending = $state(false);
	let done = $state(false);
	let failure = $state<Record<string, unknown> | null>(null);
	let email = $state("");
	let errors = $state<Record<string, FieldError> | undefined>();

	function clear(event: Event) {
		const name = (event.target as HTMLInputElement).name;
		if (errors && name in errors) {
			const { [name]: _, ...rest } = errors;
			errors = Object.keys(rest).length ? rest : undefined;
		}
	}

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (pending) return;
		pending = true;
		failure = null;
		const data = new FormData(event.currentTarget as HTMLFormElement);
		email = String(data.get("email") ?? "").trim();
		if (check) {
			errors = validateForm(check.schema, data, check.overrides);
			if (errors) {
				pending = false;
				return;
			}
		}
		const result = await run(data);
		pending = false;
		if (!result.ok) {
			failure = result.data;
			return;
		}
		if (onOk) await onOk();
		else done = true;
	}

	return {
		submit,
		clear,
		get errors() {
			return errors;
		},
		get pending() {
			return pending;
		},
		get done() {
			return done;
		},
		get failure() {
			return failure;
		},
		get email() {
			return email;
		},
	};
}
