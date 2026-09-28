const KEY = "pleiades-admin:embed";

export interface EmbedSettings {
	scriptUrl: string;
	agentUrl: string;
}

/** The two URLs the admin last typed into the embed dialog, remembered per browser (blocked storage just means "not remembered"). */
export function loadEmbedSettings(): EmbedSettings {
	try {
		const saved: unknown = JSON.parse(localStorage.getItem(KEY) ?? "{}");
		const read = (name: keyof EmbedSettings) =>
			saved !== null &&
			typeof saved === "object" &&
			typeof (saved as Record<string, unknown>)[name] === "string"
				? String((saved as Record<string, unknown>)[name])
				: "";
		return { scriptUrl: read("scriptUrl"), agentUrl: read("agentUrl") };
	} catch {
		return { scriptUrl: "", agentUrl: "" };
	}
}

export function saveEmbedSettings(settings: EmbedSettings): void {
	try {
		localStorage.setItem(KEY, JSON.stringify(settings));
	} catch {
		// Not remembered — fine.
	}
}
