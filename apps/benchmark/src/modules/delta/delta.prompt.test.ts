import { describe, expect, test } from "bun:test";
import { functionCallMessages } from "@repo/core";
import { describeFields } from "./delta.fields.ts";
import { baseMessage } from "./delta.prompt.ts";
import type { Case } from "./delta.types.ts";

// A non-shop tool on purpose: the message must read any site's schema.
const booking: Case = {
	tool: {
		name: "book_room",
		description: "Book a hotel room.",
		inputSchema: {
			type: "object",
			properties: {
				city: { type: "string" },
				breakfast: { type: "boolean", description: "Breakfast included." },
			},
		},
	},
	facts: { hotelOpen: true },
	answer: "- Hotel Roma — 2 rooms left",
	request: "a room in Rome with breakfast",
};

describe("baseMessage", () => {
	test("core's user message with the schema spelled out after the tool's description", () => {
		const core =
			functionCallMessages({
				tool: booking.tool,
				facts: booking.facts,
				lastAnswer: booking.answer,
				request: booking.request,
			})[1]?.content ?? "";
		const lines = core.split("\n");
		const after = lines.findIndex((l) => l.startsWith("What it does:")) + 1;
		lines.splice(after, 0, describeFields(booking.tool.inputSchema));
		expect(baseMessage(booking)).toBe(lines.join("\n"));
		expect(baseMessage(booking)).toContain(`Request: ${booking.request}`);
		expect(baseMessage(booking)).toContain(booking.answer as string);
	});
});
