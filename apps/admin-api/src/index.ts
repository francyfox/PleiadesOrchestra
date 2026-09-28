import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createObservability, serve } from "@repo/elysia-kit";
import { createApp } from "./app.ts";
import { createAuth } from "./auth.ts";
import { openAdminDb } from "./db/index.ts";
import { config } from "./env.ts";
import { createOrchestratorClient } from "./orchestrator/client.ts";
import { systemSnapshot } from "./system/snapshot.ts";

const observability = createObservability("admin-api", config);

if (config.ADMIN_DATABASE_PATH !== ":memory:") {
	mkdirSync(dirname(config.ADMIN_DATABASE_PATH), { recursive: true });
}
const db = openAdminDb(config.ADMIN_DATABASE_PATH, config.ADMIN_MIGRATIONS_DIR);

const app = createApp({
	observability,
	db,
	auth: createAuth({
		db,
		secret: config.BETTER_AUTH_SECRET,
		baseURL: config.BETTER_AUTH_URL,
		trustedOrigins: config.ADMIN_TRUSTED_ORIGINS,
	}),
	orchestrator: createOrchestratorClient({
		baseUrl: config.HARNESS_BASE_URL,
		apiKey: config.ADMIN_API_KEY,
	}),
	trustedOrigins: config.ADMIN_TRUSTED_ORIGINS,
	systemSnapshot,
	systemStreamIntervalMs: config.SYSTEM_STREAM_INTERVAL_MS,
});

serve(app, {
	port: config.PORT,
	observability,
	onShutdown: () => db.$client.close(),
});
