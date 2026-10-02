/** The ladder, smallest first. Q8_0: at this size quantisation costs accuracy, and the files are small anyway. */
export interface Candidate {
	id: string;
	repo: string;
	file: string;
	/** What the license allows, as the model card states it: "ok" (Apache/MIT-like), "terms" (custom terms to read), "non-commercial". */
	license?: "ok" | "terms" | "non-commercial";
	/** Qwen3 thinks by default; the chat template must be told not to. */
	qwen?: boolean;
}

export const CANDIDATES: Candidate[] = [
	{
		id: "functiongemma-270m",
		repo: "unsloth/functiongemma-270m-it-GGUF",
		file: "functiongemma-270m-it-Q8_0.gguf",
		license: "terms",
	},
	{
		id: "qwen3-0.6b",
		repo: "Qwen/Qwen3-0.6B-GGUF",
		file: "Qwen3-0.6B-Q8_0.gguf",
		license: "ok",
		qwen: true,
	},
	{
		id: "qwen3-1.7b",
		repo: "Qwen/Qwen3-1.7B-GGUF",
		file: "Qwen3-1.7B-Q8_0.gguf",
		license: "ok",
		qwen: true,
	},
	// Same family, Q4_K_M (what would ship: smaller, faster) and the 4B instruct for the knowledge-heavy tasks.
	{
		id: "qwen3-1.7b-q4km",
		repo: "unsloth/Qwen3-1.7B-GGUF",
		file: "Qwen3-1.7B-Q4_K_M.gguf",
		license: "ok",
		qwen: true,
	},
	{
		id: "qwen3-4b-2507",
		repo: "unsloth/Qwen3-4B-Instruct-2507-GGUF",
		file: "Qwen3-4B-Instruct-2507-Q4_K_M.gguf",
		license: "ok",
	},
	// Trained specifically for function calling. Measured even where the
	// license forbids commercial use: it tells whether specialisation beats
	// size, which decides whether a license (or a fine-tune of our own) is worth it.
	{
		id: "hammer2.1-0.5b",
		repo: "Melvin56/Hammer2.1-0.5b-GGUF",
		file: "hammer2.1-0.5b-Q8_0.gguf",
		license: "non-commercial",
	},
	{
		id: "hammer2.1-1.5b",
		repo: "Melvin56/Hammer2.1-1.5b-GGUF",
		file: "hammer2.1-1.5b-Q8_0.gguf",
		license: "non-commercial",
	},
	{
		id: "xlam-2-1b",
		repo: "Salesforce/xLAM-2-1b-fc-r-gguf",
		file: "xLAM-2-1B-fc-r-Q8_0.gguf",
		license: "non-commercial",
	},
	{
		id: "lfm2-1.2b-tool",
		repo: "LiquidAI/LFM2-1.2B-Tool-GGUF",
		file: "LFM2-1.2B-Tool-Q8_0.gguf",
		license: "terms",
	},
	{
		id: "arch-function-1.5b",
		repo: "bartowski/Arch-Function-1.5B-GGUF",
		file: "Arch-Function-1.5B-Q8_0.gguf",
		license: "terms",
	},
];
