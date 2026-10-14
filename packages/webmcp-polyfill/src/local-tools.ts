import type { AnyWindow, NormalizedTool } from "./types.ts";

type Field = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

function fieldType(el: Field): "string" | "number" | "boolean" {
	if (el.tagName === "SELECT") return "string";
	const type = (el as HTMLInputElement).type;
	if (type === "number" || type === "range") return "number";
	if (type === "checkbox") return "boolean";
	return "string";
}

function fieldSchema(el: Field): Record<string, unknown> {
	const property: Record<string, unknown> = { type: fieldType(el) };
	const description = el.getAttribute("toolparamdescription") ?? "";
	if (description) property.description = description;
	if (el.tagName === "SELECT") {
		property.enum = Array.from((el as HTMLSelectElement).options).map(
			(o) => o.value || o.text,
		);
	}
	return property;
}

function formInputSchema(form: HTMLFormElement): Record<string, unknown> {
	const properties: Record<string, unknown> = {};
	const required: string[] = [];
	for (const el of form.querySelectorAll<Field>(
		"input[name], select[name], textarea[name]",
	)) {
		properties[el.name] = fieldSchema(el);
		if (el.hasAttribute("required")) required.push(el.name);
	}
	const schema: Record<string, unknown> = { type: "object", properties };
	if (required.length > 0) schema.required = required;
	return schema;
}

function formTool(form: HTMLFormElement, w: AnyWindow): NormalizedTool | null {
	const name = form.getAttribute("toolname");
	if (!name) return null;
	return {
		name,
		description: form.getAttribute("tooldescription") ?? "",
		inputSchema: formInputSchema(form),
		window: w,
		origin: w.origin,
		_form: form,
	};
}

function declarativeTools(w: AnyWindow): NormalizedTool[] {
	const tools: NormalizedTool[] = [];
	for (const form of w.document.querySelectorAll<HTMLFormElement>(
		"form[toolname]",
	)) {
		const tool = formTool(form, w);
		if (tool) tools.push(tool);
	}
	return tools;
}

/** Tools registered imperatively plus declarative `<form toolname>` tools. */
export function getLocalTools(w: AnyWindow): NormalizedTool[] {
	return [
		...(w.__webmcp_registered_tools?.values() ?? []),
		...declarativeTools(w),
	];
}
