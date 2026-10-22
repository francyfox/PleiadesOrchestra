import { z } from "zod";

/** The part of a JSON/TypeBox schema the forms read: top-level properties and their types. */
export interface FormSchema {
	properties?: Record<string, unknown>;
}

/**
 * For a field whose form input differs from the wire value: a reader of the
 * wire value from the whole form (`undefined` = leave the field out), e.g.
 * `{ model: (f) => String(f.get("model")).split("\t")[1] }`.
 */
export type FieldOverrides = Record<string, (form: FormData) => unknown>;

const cache = new WeakMap<object, z.ZodType>();

/** The zod twin of a TypeBox schema from `admin-api/forms`. */
export function toZod(schema: FormSchema): z.ZodType {
	let zod = cache.get(schema);
	if (!zod) {
		zod = z.fromJSONSchema(schema as Parameters<typeof z.fromJSONSchema>[0]);
		cache.set(schema, zod);
	}
	return zod;
}

/**
 * Reads the schema's top-level fields out of a form: strings trimmed, an empty
 * one left out (so it is "required" or skipped when optional), numbers typed,
 * arrays via `getAll`, booleans = checkbox ticked, objects parsed from JSON
 * (unparsable text stays a string so validation reports it; empty = `{}`).
 */
export function formDataToObject(
	form: FormData,
	schema: FormSchema,
	overrides: FieldOverrides = {},
) {
	const out: Record<string, unknown> = {};
	for (const [name, prop] of Object.entries(schema.properties ?? {})) {
		const { type } = prop as { type?: string };
		const read = overrides[name];
		if (read) {
			const value = read(form);
			if (value !== undefined) out[name] = value;
			continue;
		}
		if (type === "array") out[name] = form.getAll(name);
		else if (type === "boolean") out[name] = form.has(name);
		else {
			const raw = String(form.get(name) ?? "").trim();
			if (type === "object") {
				try {
					out[name] = raw ? JSON.parse(raw) : {};
				} catch {
					out[name] = raw;
				}
			} else if (raw)
				out[name] = type === "number" || type === "integer" ? Number(raw) : raw;
		}
	}
	return out;
}
