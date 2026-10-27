export interface AgentSetting {
	agent: string;
	model: string;
	temperature?: number;
}

interface ModelConfig {
	id: string;
	temperature?: number;
	[key: string]: unknown;
}

const AGENTS = [
	"beta-text",
	"delta-function-call",
	"gamma-decision",
	"alpha-understand",
];
/** The text models whose sampling the bench pins to the minimum. */
const PINNED = ["beta-text", "delta-function-call"];

/**
 * The orchestrator's admin API for the bench: what model and temperature each
 * agent runs with, and `freeze()` to set the text models' temperature to 0 for
 * the run (it returns the function that puts the original configs back).
 */
export function createOrchestraSettings(deps: {
	baseUrl: string;
	adminApiKey: string;
	fetch?: typeof fetch;
}) {
	const http = deps.fetch ?? fetch;

	async function admin<T>(path: string, put?: unknown): Promise<T> {
		const response = await http(`${deps.baseUrl}/v1/admin${path}`, {
			method: put ? "PUT" : "GET",
			headers: {
				authorization: `Bearer ${deps.adminApiKey}`,
				...(put ? { "x-admin-id": "benchmark" } : {}),
				...(put ? { "content-type": "application/json" } : {}),
			},
			...(put ? { body: JSON.stringify(put) } : {}),
		});
		if (!response.ok) throw new Error(`admin ${path}: HTTP ${response.status}`);
		return (await response.json()) as T;
	}

	const providers = async () =>
		(
			await admin<{ items: { id: string; models: ModelConfig[] }[] }>(
				"/providers",
			)
		).items;

	return {
		/** Model and temperature (undefined: the model has none) of each agent. */
		async agents(): Promise<AgentSetting[]> {
			const [{ items }, all] = await Promise.all([
				admin<{ items: { id: string; model: string }[] }>("/agents"),
				providers(),
			]);
			const configs = all.flatMap((provider) => provider.models);
			return AGENTS.flatMap((agent) => {
				const model = items.find((one) => one.id === agent)?.model;
				if (!model) return [];
				return [
					{
						agent,
						model,
						// alpha-understand is built with temperature 0 whatever its model is configured with.
						temperature:
							agent === "alpha-understand"
								? 0
								: configs.find((one) => one.id === model)?.temperature,
					},
				];
			});
		},

		async freeze(): Promise<() => Promise<void>> {
			const all = await providers();
			const originals = new Map<
				string,
				{ provider: string; model: ModelConfig }
			>();
			for (const agent of PINNED) {
				const { provider, model } = await admin<{
					provider: string;
					model: string;
				}>(`/agents/${agent}`);
				const config = all
					.find((one) => one.id === provider)
					?.models.find((one) => one.id === model);
				if (config)
					originals.set(`${provider}/${model}`, { provider, model: config });
			}
			const put = (provider: string, model: ModelConfig) =>
				admin(`/providers/${provider}/models`, model);
			let restored: Promise<void> | undefined;
			const restore = () =>
				(restored ??= (async () => {
					for (const { provider, model } of originals.values())
						await put(provider, model);
				})());
			try {
				for (const { provider, model } of originals.values())
					await put(provider, { ...model, temperature: 0 });
			} catch (error) {
				await restore();
				throw error;
			}
			return restore;
		},
	};
}

/** `beta-text: model, temperature 0 (was 0.3)` for the report's setup block. */
export function agentLine(before: AgentSetting, during: AgentSetting): string {
	const now = during.temperature ?? "n/a";
	const was =
		before.temperature !== during.temperature
			? ` (was ${before.temperature ?? "n/a"})`
			: "";
	return `${during.agent}: ${during.model}, temperature ${now}${was}`;
}
