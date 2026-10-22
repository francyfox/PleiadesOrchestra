import type { Static, TObject } from "@sinclair/typebox";
import {
	type FieldOverrides,
	formDataToObject,
	toZod,
} from "./schema-to-zod.ts";

export interface FieldError {
	code:
		| "required"
		| "too_short"
		| "too_long"
		| "pattern"
		| "too_small"
		| "too_big"
		| "invalid";
	limit?: number;
}

/** The slice of a zod issue the mapping reads. */
interface Issue {
	code: string;
	origin?: string;
	minimum?: number | bigint;
	maximum?: number | bigint;
}

const isText = (origin?: string) => origin === "string" || origin === "array";

/** Missing, an empty string or an empty array is "required"; the rest keeps its limit. */
export function toFieldError(issue: Issue, missing: boolean): FieldError {
	if (issue.code === "invalid_type" && missing) return { code: "required" };
	if (issue.code === "too_small") {
		const limit = Number(issue.minimum);
		if (isText(issue.origin))
			return limit <= 1 ? { code: "required" } : { code: "too_short", limit };
		return { code: "too_small", limit };
	}
	if (issue.code === "too_big") {
		const limit = Number(issue.maximum);
		return { code: isText(issue.origin) ? "too_long" : "too_big", limit };
	}
	if (issue.code === "invalid_format") return { code: "pattern" };
	return { code: "invalid" };
}

export type ParseResult<T> =
	| { ok: true; body: T }
	| { ok: false; errors: Record<string, FieldError> };

// One FormData is parsed once: the enhance validates it, then the action reads the body.
const parsed = new WeakMap<FormData, { schema: object; result: unknown }>();

/**
 * Validates a form against an `admin-api/forms` schema and returns the
 * zod-parsed body typed as the schema's static type, or one error per
 * top-level field name (the first found).
 */
export function parseForm<T extends TObject>(
	schema: T,
	form: FormData,
	overrides?: FieldOverrides,
): ParseResult<Static<T>> {
	const hit = parsed.get(form);
	if (hit?.schema === schema) return hit.result as ParseResult<Static<T>>;
	const object = formDataToObject(form, schema, overrides);
	const zod = toZod(schema).safeParse(object);
	let result: ParseResult<Static<T>>;
	if (zod.success) result = { ok: true, body: zod.data as Static<T> };
	else {
		const errors: Record<string, FieldError> = {};
		for (const issue of zod.error.issues) {
			const name = String(issue.path[0] ?? "");
			errors[name] ??= toFieldError(issue, object[name] === undefined);
		}
		result = { ok: false, errors };
	}
	parsed.set(form, { schema, result });
	return result;
}

/** `parseForm`'s errors only; undefined when the form is valid. */
export function validateForm(
	schema: TObject,
	form: FormData,
	overrides?: FieldOverrides,
) {
	const result = parseForm(schema, form, overrides);
	return result.ok ? undefined : result.errors;
}
