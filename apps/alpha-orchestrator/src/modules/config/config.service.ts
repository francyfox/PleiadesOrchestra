import { buildConfig } from "./config.ts";

/** Runtime config singleton. Tests import `buildConfig` from `config.ts` instead. */
export const config = buildConfig(process.env);
