import type { FunctionCallTool } from "@repo/core";

/** A site's tool as `document.modelContext` lists it: name, description, JSON-schema input. */
export interface ToolSpec {
	name: string;
	description: string;
	inputSchema: FunctionCallTool["inputSchema"];
}

/** What one tool call to delta is about. */
export interface Case {
	tool: ToolSpec;
	/** Facts the planner already knows (open store, parsed product, …). */
	facts: Record<string, string | number | boolean>;
	/** What the previous tool answered, if this step depends on it. */
	answer?: string;
	/** The request in English, as the translator hands it to delta. */
	request: string;
}

/** Where an OpenAI-compatible llama-server answers; `baseUrl` is the server root, without `/v1`. */
export interface Endpoint {
	baseUrl: string;
	apiKey?: string;
	/** Sent as `model`; only multi-model servers (Ollama) need it. */
	model?: string;
}

export interface Server extends Endpoint {
	stop(): Promise<void>;
}

export interface ServerOptions {
	/** Layers on the iGPU (Vulkan); 0 = CPU only. */
	gpuLayers: number;
	threads: number;
	contextSize: number;
}

export interface Filled {
	args: Record<string, unknown>;
	latencyMs: number;
	promptTokens: number;
	outputTokens: number;
	/** Chat completions it took. */
	calls: number;
}
