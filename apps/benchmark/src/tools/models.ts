/** The model delta runs in production; a test keeps it equal to delta's Dockerfile `MODEL_URL`. */
export interface Model {
	id: string;
	repo: string;
	file: string;
}

export const DELTA_MODEL: Model = {
	id: "qwen3-1.7b",
	repo: "Qwen/Qwen3-1.7B-GGUF",
	file: "Qwen3-1.7B-Q8_0.gguf",
};

export const modelUrl = (model: Model) =>
	`https://huggingface.co/${model.repo}/resolve/main/${model.file}`;
