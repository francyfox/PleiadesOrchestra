import { describe, expect, test } from "bun:test";
import { FUNCTION_CALL_SYSTEM_PROMPT } from "@repo/core";
import { baseMessage } from "./delta.prompt.ts";
import {
	choiceMessages,
	choiceSchema,
	fieldMessages,
	fieldSchema,
	fieldsToFill,
	optionalFields,
} from "./delta.service.ts";
import type { Case } from "./delta.types.ts";

const ROOM = { type: "string", enum: ["single", "double"] };
const tool = {
	name: "book_room",
	description: "Book a hotel room.",
	inputSchema: {
		type: "object" as const,
		properties: {
			city: { type: "string" },
			room: ROOM,
			nights: { type: "integer" },
			breakfast: { type: "boolean" },
		},
		required: ["nights", "city"],
	},
};
const booking: Case = {
	tool,
	facts: { hotelOpen: true },
	request: "a double room in Rome for 3 nights",
};
const base = baseMessage(booking);

describe("phase 1: which optional fields", () => {
	test("the optional fields, in schema order", () => {
		expect(optionalFields(tool)).toEqual(["room", "breakfast"]);
	});

	test("fields decided elsewhere (Laya) are not offered", () => {
		expect(optionalFields(tool, ["room", "breakfast"])).toEqual([]);
	});

	test("answer: a list of their names, nothing else", () => {
		expect(choiceSchema(["room", "breakfast"])).toEqual({
			type: "object",
			properties: {
				fill: {
					type: "array",
					items: { type: "string", enum: ["room", "breakfast"] },
					maxItems: 2,
				},
			},
			required: ["fill"],
		});
	});

	test("the usual message with the fields spelled out, then the question", () => {
		const [system, user] = choiceMessages(booking);
		expect(system?.role).toBe("system");
		expect(system?.content).not.toBe(FUNCTION_CALL_SYSTEM_PROMPT);
		expect(user?.content.startsWith(`${base}\n`)).toBe(true);
		expect(user?.content).toContain("Optional fields: room, breakfast");
	});
});

describe("phase 2: one field at a time", () => {
	test("required fields first, then the chosen optional ones; unknown names are ignored", () => {
		expect(fieldsToFill(tool, ["breakfast", "spa", "room"])).toEqual([
			"city",
			"nights",
			"room",
			"breakfast",
		]);
	});

	test("fields decided elsewhere are never filled, required or not", () => {
		expect(fieldsToFill(tool, ["room"], ["city", "room"])).toEqual(["nights"]);
	});

	test("the schema holds only that field, required", () => {
		expect(fieldSchema(tool, "room")).toEqual({
			type: "object",
			properties: { room: ROOM },
			required: ["room"],
		});
	});

	test("core's rules; the usual message plus what is already filled and the one field asked for", () => {
		const [system, user] = fieldMessages(booking, "room", {
			city: "Rome",
			nights: 3,
		});
		expect(system?.content).toBe(FUNCTION_CALL_SYSTEM_PROMPT);
		expect(user?.content).toBe(
			`${base}\nAlready filled: {"city":"Rome","nights":3}\nFill only: room`,
		);
	});
});
