const REASONING_EFFORTS = ["none", "low", "medium", "high"] as const;
/** Named after the AI SDK's model factories; what the model is for. */
export const MODEL_TYPES = ["language", "decision", "translation"] as const;

const text = (form: FormData, name: string) =>
	String(form.get(name) ?? "").trim();

/**
 * Reads the model form into the body of `PUT /api/providers/:id/models`.
 * Empty temperature / effort = not sent (the server's default applies);
 * `null` = the extra-body field is not a JSON object.
 */
export function providerModelFromForm(form: FormData) {
	const id = text(form, "id");
	const extra = text(form, "extraBody");
	let extraBody: Record<string, unknown> = {};
	if (extra) {
		try {
			const parsed: unknown = JSON.parse(extra);
			if (
				parsed === null ||
				typeof parsed !== "object" ||
				Array.isArray(parsed)
			)
				return null;
			extraBody = parsed as Record<string, unknown>;
		} catch {
			return null;
		}
	}
	const temperature = text(form, "temperature");
	const effort = REASONING_EFFORTS.find(
		(e) => e === text(form, "reasoningEffort"),
	);
	const type = MODEL_TYPES.find((t) => t === text(form, "type")) ?? "language";
	return {
		id,
		name: text(form, "name") || id,
		type,
		...(temperature ? { temperature: Number(temperature) } : {}),
		...(effort ? { reasoningEffort: effort } : {}),
		extraBody,
	};
}
