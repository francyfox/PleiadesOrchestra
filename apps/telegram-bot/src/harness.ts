import { config } from "./env.ts";
import { createHarnessClient } from "./harness-client.ts";

export const harnessClient = createHarnessClient({
	baseURL: config.HARNESS_BASE_URL,
	apiKey: config.HARNESS_API_KEY,
});
