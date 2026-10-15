import { describe, expect, test } from "bun:test";
import { layaFields } from "../laya/laya.service.ts";
import { LAYA_CASES } from "./choices.cases.ts";

describe("LAYA_CASES", () => {
	test("many sites, and every kind of decision in both field kinds", () => {
		expect(new Set(LAYA_CASES.map((c) => c.domain)).size).toBeGreaterThan(8);
		const seen = new Set(
			LAYA_CASES.flatMap((c) =>
				Object.values(c.expected).map((value) =>
					value === null
						? "unsaid"
						: value === false
							? "refused"
							: typeof value === "string"
								? "enum"
								: "boolean",
				),
			),
		);
		expect([...seen].sort()).toEqual(["boolean", "enum", "refused", "unsaid"]);
	});

	test("ids are unique", () => {
		const ids = LAYA_CASES.map((c) => c.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	for (const c of LAYA_CASES) {
		test(`${c.id}: every field is one Laya answers, with a value from the schema`, () => {
			// Every field Laya would be asked about is judged, nothing else.
			expect(Object.keys(c.expected).sort()).toEqual(layaFields(c.tool).sort());
			const properties = c.tool.inputSchema.properties ?? {};
			for (const [name, value] of Object.entries(c.expected)) {
				const field = properties[name] as { type?: string; enum?: unknown[] };
				if (typeof value === "string") expect(field.enum).toContain(value);
				if (typeof value === "boolean") expect(field.type).toBe("boolean");
			}
		});
	}
});
