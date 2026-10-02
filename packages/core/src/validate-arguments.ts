interface SchemaNode {
	type?: string | string[];
	enum?: unknown[];
	properties?: Record<string, unknown>;
	required?: string[];
	items?: unknown;
}

function typeOf(value: unknown): string {
	if (value === null) return "null";
	if (Array.isArray(value)) return "array";
	return typeof value;
}

function matchesType(type: string, value: unknown): boolean {
	if (type === "integer") return Number.isInteger(value);
	return typeOf(value) === type;
}

/**
 * Checks a value against the part of JSON Schema tool inputs actually use:
 * `type`, `enum`, `required`, `properties`, `items`. Returns one message per
 * problem (empty = valid), in schema order. Not a full validator on purpose —
 * `$ref`, `oneOf`, string formats and bounds are ignored, so an exotic schema
 * is never *rejected* by this, only checked less.
 */
export function validateArguments(
	schema: unknown,
	value: unknown,
	path = "arguments",
): string[] {
	const node = (schema ?? {}) as SchemaNode;
	const types = node.type === undefined ? [] : [node.type].flat();
	if (types.length > 0 && !types.some((type) => matchesType(type, value))) {
		return [`${path} must be ${types.join(" or ")}`];
	}
	if (
		node.enum &&
		!node.enum.some(
			(option) => JSON.stringify(option) === JSON.stringify(value),
		)
	) {
		return [`${path} must be one of ${node.enum.join(", ")}`];
	}

	const problems: string[] = [];
	if (typeOf(value) === "object") {
		const object = value as Record<string, unknown>;
		const here = (key: string) =>
			path === "arguments" ? key : `${path}.${key}`;
		for (const key of node.required ?? []) {
			if (object[key] === undefined) problems.push(`${here(key)} is required`);
		}
		for (const [key, property] of Object.entries(node.properties ?? {})) {
			if (object[key] !== undefined) {
				problems.push(...validateArguments(property, object[key], here(key)));
			}
		}
	} else if (Array.isArray(value) && node.items) {
		value.forEach((item, index) => {
			problems.push(
				...validateArguments(node.items, item, `${path}[${index}]`),
			);
		});
	}
	return problems;
}
