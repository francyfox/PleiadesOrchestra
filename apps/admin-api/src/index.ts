import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createObservability, serve } from "@repo/elysia-kit";
import { createApp } from "./app.ts";
import { deleteInactiveUsers } from "./modules/accounts/accounts.service.ts";
import { createAuth } from "./modules/auth/auth.ts";
import { DAY_MS } from "./modules/common/common.service.ts";
import { config } from "./modules/config/config.service.ts";
import { openAdminDb } from "./modules/database/database.ts";
import { createMailer } from "./modules/mail/mail.ts";
import { createOrchestratorClient } from "./modules/orchestrator/orchestrator.ts";
import { systemSnapshot } from "./modules/system/system-snapshot.service.ts";

const observability = createObservability("admin-api", config);

if (config.ADMIN_DATABASE_PATH !== ":memory:") {
	mkdirSync(dirname(config.ADMIN_DATABASE_PATH), { recursive: true });
}
const db = openAdminDb(config.ADMIN_DATABASE_PATH, config.ADMIN_MIGRATIONS_DIR);

const panelUrl = config.PUBLIC_PANEL_URL ?? config.BETTER_AUTH_URL;

const orchestrator = createOrchestratorClient({
	baseUrl: config.HARNESS_BASE_URL,
	apiKey: config.ADMIN_API_KEY,
});

const app = createApp({
	panelUrl,
	observability,
	db,
	auth: createAuth({
		db,
		secret: config.BETTER_AUTH_SECRET,
		baseURL: config.BETTER_AUTH_URL,
		trustedOrigins: config.ADMIN_TRUSTED_ORIGINS,
		panelUrl,
		mailer: createMailer({
			host: config.SMTP_HOST,
			port: config.SMTP_PORT,
			user: config.SMTP_USER,
			pass: config.SMTP_PASS,
			from: config.SMTP_FROM,
			log: (line) => observability.logger.info(line),
		}),
	}),
	orchestrator,
	trustedOrigins: config.ADMIN_TRUSTED_ORIGINS,
	clientIp: {
		source: config.CLIENT_IP_SOURCE,
		hops: config.TRUSTED_PROXY_HOPS,
	},
	loginLimits: {
		maxFailuresPerAccount: config.LOGIN_MAX_FAILURES_PER_ACCOUNT,
		maxFailuresPerIp: config.LOGIN_MAX_FAILURES_PER_IP,
		windowMinutes: config.LOGIN_LOCKOUT_MINUTES,
	},
	systemSnapshot,
	systemStreamIntervalMs: config.SYSTEM_STREAM_INTERVAL_MS,
});

const cleanInactive = () =>
	deleteInactiveUsers(
		{
			db,
			orchestrator,
			onError: (id, error) =>
				observability.logger.error(
					`inactive user ${id} kept, channels not deleted: ${error}`,
				),
		},
		Date.now(),
	).then(
		(count) =>
			count && observability.logger.info(`deleted ${count} inactive users`),
		(error) =>
			observability.logger.error(`inactive-user cleanup failed: ${error}`),
	);
void cleanInactive();
setInterval(cleanInactive, DAY_MS).unref();

serve(app, {
	port: config.PORT,
	observability,
	onShutdown: () => db.$client.close(),
});
