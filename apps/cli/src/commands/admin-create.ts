import { defineCommand, option } from "@bunli/core";
import { $ } from "bun";
import { z } from "zod";

export default defineCommand({
	name: "admin:create",
	description:
		"Create a staff account (or a new token for an existing one) in the running admin-api container",
	options: {
		email: option(z.string(), { description: "Staff email" }),
		name: option(z.string().optional(), { description: "Display name" }),
		level: option(z.enum(["0", "100"]).optional(), {
			description:
				"0 super admin, 100 admin (default: first account 0, then 100)",
		}),
	},
	handler: async ({ flags }) => {
		const extra = [
			...(flags.name ? ["--name", flags.name] : []),
			...(flags.level ? ["--level", flags.level] : []),
		];
		// -T: no TTY under Bun's shell; -p: works from any directory, no compose file needed.
		const { exitCode } =
			await $`docker compose -p pleiades-orchestra exec -T admin-api admin-api admin:create --email ${flags.email} ${extra}`.nothrow();
		process.exit(exitCode);
	},
});
