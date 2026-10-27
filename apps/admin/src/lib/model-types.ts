/** Named after the AI SDK's model factories; what a model can do. Shown as is (English) in every locale. */
export const MODEL_TYPES = [
	"language",
	"embedding",
	"image",
	"video",
	"speech",
	"transcription",
	"reranking",
	"decision",
] as const;
export type ModelType = (typeof MODEL_TYPES)[number];

/** "language" → "Language": the type as shown in the panel. */
export const typeLabel = (type: string) =>
	type.charAt(0).toUpperCase() + type.slice(1);
