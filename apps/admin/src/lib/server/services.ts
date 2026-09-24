import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { sveltekitCookies } from "better-auth/svelte-kit";
import { building } from "$app/environment";
import { getRequestEvent } from "$app/server";
import { env } from "$env/dynamic/private";
import { createAuth } from "./auth";
import { buildConfig } from "./config";
import { countAdmins, openAdminDb } from "./db";
import { createOrchestratorClient } from "./orchestrator-client";

function create() {
	const config = buildConfig(env, { skipValidation: building });
	if (config.ADMIN_DATABASE_PATH !== ":memory:") {
		mkdirSync(dirname(config.ADMIN_DATABASE_PATH), { recursive: true });
	}
	const db = openAdminDb(
		config.ADMIN_DATABASE_PATH,
		config.ADMIN_MIGRATIONS_DIR,
	);
	const auth = createAuth({
		db,
		secret: config.BETTER_AUTH_SECRET,
		baseURL: config.BETTER_AUTH_URL,
		extraPlugins: [sveltekitCookies(getRequestEvent)],
	});
	const orchestrator = createOrchestratorClient({
		baseUrl: config.HARNESS_BASE_URL,
		apiKey: config.ADMIN_API_KEY,
	});
	return { config, db, auth, orchestrator };
}

let instance: ReturnType<typeof create> | undefined;

/**
 * Runtime singletons, built on first use rather than at import: SvelteKit
 * imports server modules during `vite build` analysis, where neither the env
 * nor the database should be touched.
 */
export function services() {
	instance ??= create();
	return instance;
}

let adminExists = false;

/**
 * Whether first-run registration is over. Cached once true — it can't go
 * back, since the last active admin can't be banned (see `admin-policy.ts`).
 */
export async function hasAdmin(): Promise<boolean> {
	if (!adminExists) adminExists = (await countAdmins(services().db)) > 0;
	return adminExists;
}
