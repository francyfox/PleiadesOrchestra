/**
 * `bun --cwd apps/admin-api run admin:create --email Y [--name X] [--level 0|100]`
 * Creates a staff account and prints its access token once. For an existing
 * staff email it issues a new token instead (the way into an install that
 * predates tokens). The first account becomes a super admin.
 */
import { parseArgs } from "node:util";
import { createAuth } from "../auth/auth.ts";
import { config } from "../config/config.service.ts";
import { openAdminDb } from "../database/database.ts";
import { createMailer } from "../mail/mail.ts";
import { createOrRotateStaff } from "./admins-cli.service.ts";

const { values } = parseArgs({
	options: {
		name: { type: "string" },
		email: { type: "string" },
		level: { type: "string" },
	},
});

const db = openAdminDb(config.ADMIN_DATABASE_PATH, config.ADMIN_MIGRATIONS_DIR);
const auth = createAuth({
	db,
	secret: config.BETTER_AUTH_SECRET,
	baseURL: config.BETTER_AUTH_URL,
	panelUrl: config.PUBLIC_PANEL_URL ?? config.BETTER_AUTH_URL,
	// The CLI never sends mail.
	mailer: createMailer({ host: "", port: 0, from: "", log: () => {} }),
});

const result = await createOrRotateStaff(db, auth, values);
db.$client.close();
if (!result.ok) {
	console.error(result.error);
	process.exit(1);
}
console.log(
	`${result.created ? "Created" : "New token for"} ${values.email}. Access token (shown once):\n\n${result.token}\n`,
);
