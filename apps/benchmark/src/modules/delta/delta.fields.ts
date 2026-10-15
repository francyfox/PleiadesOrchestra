/**
 * The tool's input schema spelled out for the model. Delta only sees the
 * schema as a decoding grammar (`response_format`), never as text, so field
 * descriptions, enum values and nesting don't reach it otherwise. Nothing is
 * cut: a partly listed enum would still be allowed by the grammar, but the
 * model would not know the hidden values (context budget: PO-40).
 */

interface Schema {
	type?: string;
	description?: string;
	enum?: unknown[];
	minimum?: number;
	maximum?: number;
	items?: Schema;
	properties?: Record<string, unknown>;
	required?: string[];
}

const quoted = (values: unknown[]) =>
	values.map((value) => JSON.stringify(value)).join(", ");

function range(schema: Schema): string {
	const { minimum: min, maximum: max } = schema;
	if (min !== undefined && max !== undefined) return ` ${min}-${max}`;
	if (min !== undefined) return ` >= ${min}`;
	if (max !== undefined) return ` <= ${max}`;
	return "";
}

function kind(schema: Schema): string {
	if (schema.type === "array") {
		const items = schema.items ?? {};
		if (items.enum) return `list of: ${quoted(items.enum)}`;
		return `list of ${items.type ?? "value"}s`;
	}
	const type = `${schema.type ?? "value"}${range(schema)}`;
	return schema.enum ? `${type}, one of: ${quoted(schema.enum)}` : type;
}

function lines(schema: Schema, indent: string): string[] {
	const required = new Set(schema.required ?? []);
	return Object.entries(schema.properties ?? {}).flatMap(([name, raw]) => {
		const field = (raw ?? {}) as Schema;
		const flags = `${kind(field)}${required.has(name) ? ", required" : ""}`;
		const about = field.description ? `: ${field.description}` : "";
		const nested =
			field.type === "array" ? field.items : field.properties ? field : null;
		return [
			`${indent}- ${name} (${flags})${about}`,
			...(nested?.properties ? lines(nested, `${indent}  `) : []),
		];
	});
}

export function describeFields(schema: Schema): string {
	const body = lines(schema, "");
	return body.length ? ["Fields:", ...body].join("\n") : "";
}
