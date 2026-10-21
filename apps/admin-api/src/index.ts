import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createObservability, serve } from "@repo/elysia-kit";
import { createApp } from "./app.ts";
import { deleteInactiveUsers } from "./modules/accounts/accounts.service.ts";
import { runAdminCreate } from "./modules/admins/admins-cli.ts";
import { createAuth } from "./modules/auth/auth.ts";
import { createPolarClient } from "./modules/billing/billing.service.ts";
import { DAY_MS } from "./modules/common/common.service.ts";
import { config } from "./modules/config/config.service.ts";
import { openAdminDb } from "./modules/database/database.ts";
import { createMailer } from "./modules/mail/mail.ts";
import { createOrchestratorClient } from "./modules/orchestrator/orchestrator.ts";
import { systemSnapshot } from "./modules/system/system-snapshot.service.ts";

// The staff CLI runs inside the same binary (the image has nothing else): `admin-api admin:create ...`.
if (process.argv[2] === "admin:create") {
	process.exit(await runAdminCreate(process.argv.slice(3)));
}

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

const mailer = createMailer({
	host: config.SMTP_HOST,
	port: config.SMTP_PORT,
	user: config.SMTP_USER,
	pass: config.SMTP_PASS,
	from: config.SMTP_FROM,
	log: (line) => observability.logger.info(line),
	onError: (error) => {
		observability.logger.error(error.message);
		observability.monitoring.capture(error, { feature: "mail" });
	},
});

const polar = config.POLAR_ACCESS_TOKEN
	? createPolarClient({
			token: config.POLAR_ACCESS_TOKEN,
			server: config.POLAR_SERVER,
			planProductId: config.POLAR_PLAN_PRODUCT_ID,
			creditsProductId: config.POLAR_CREDITS_PRODUCT_ID,
		})
	: undefined;

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
		mailer,
	}),
	orchestrator,
	mailer,
	polar,
	trustedOrigins: config.ADMIN_TRUSTED_ORIGINS,
	sentryTunnel: config.SENTRY_TUNNEL_DSN
		? { dsn: config.SENTRY_TUNNEL_DSN }
		: undefined,
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
			polar,
			onError: (id, error) =>
				observability.logger.error(
					`inactive user ${id} kept, not deleted: ${error}`,
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
