/**
 * Laya (`receptron/laya-onnx`) reads English only. A decision call whose text
 * could not be turned into English is refused with this instead of being sent
 * in Russian; callers catch it and use their own fallback.
 */
export class UntranslatableError extends Error {
	constructor(readonly text: string) {
		super(`cannot send non-English text to the decision model: "${text}"`);
	}
}
