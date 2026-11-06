import { defineCommand, option } from "@bunli/core";
import { $ } from "bun";
import { z } from "zod";

/** The container of the one-command install (`scripts/install.sh`: `docker run --name pleiades`). */
const CONTAINER = "pleiades";

export type AdminCreateMode = "local" | "container" | "compose";

/**
 * Where `admin-api admin:create` runs: the binary itself when it is on PATH (inside the single image),
 * else in the running `pleiades` container (the one-command install), else in the compose service
 * (development; the exact name, so `pleiades-orchestra-admin-api-1` does not count).
 */
export const adminCreateMode = (found: {
	hasBinary: boolean;
	runningContainers: string[];
}): AdminCreateMode =>
	found.hasBinary
		? "local"
		: found.runningContainers.includes(CONTAINER)
			? "container"
			: "compose";

/** The command line for a mode (compose: -T, no TTY under Bun's shell; -p, works from any directory, no compose file needed). */
export const adminCreateArgv = (mode: AdminCreateMode, args: string[]) => [
	...(mode === "container"
		? ["docker", "exec", CONTAINER]
		: mode === "compose"
			? [
					"docker",
					"compose",
					"-p",
					"pleiades-orchestra",
					"exec",
					"-T",
					"admin-api",
				]
			: []),
	"admin-api",
	"admin:create",
	...args,
];

export default defineCommand({
	name: "admin:create",
	alias: "ac",
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
		const args = [
			"--email",
			flags.email,
			...(flags.name ? ["--name", flags.name] : []),
			...(flags.level ? ["--level", flags.level] : []),
		];
		const hasBinary = Bun.which("admin-api") !== null;
		// No docker (or no daemon) is an empty list: the compose branch then reports docker's own error.
		const running = hasBinary
			? ""
			: (
					await $`docker ps --format {{.Names}}`.nothrow().quiet()
				).stdout.toString();
		const mode = adminCreateMode({
			hasBinary,
			runningContainers: running.split("\n").filter(Boolean),
		});
		const { exitCode } = await $`${adminCreateArgv(mode, args)}`.nothrow();
		process.exit(exitCode);
	},
});
