import { defineCommand, option } from "@bunli/core";
import { $ } from "bun";
import { z } from "zod";
import { evalEnv } from "../eval-env.ts";

const CORE = new URL("../../../../packages/core/", import.meta.url).pathname;

export default defineCommand({
	name: "eval",
	description:
		"Run a packages/core eval against the models the running alpha-orchestrator uses",
	options: {
		name: option(z.enum(["intents", "tools", "choose-tool", "decompose"]), {
			description:
				"intents (message intent), tools (tool intent), choose-tool (tool per message), decompose (tasks)",
		}),
		misses: option(z.boolean().default(false), {
			description: "intents: also print every wrong answer",
		}),
	},
	handler: async ({ flags }) => {
		const script = `${CORE}eval/${flags.name}.ts`;
		if (!(await Bun.file(script).exists())) {
			console.error(`${script} not found: run albedo from the repo checkout`);
			process.exit(1);
		}
		// -T: no TTY under Bun's shell; -p: works from any directory, no compose file needed.
		const settings =
			await $`docker compose -p pleiades-orchestra exec -T alpha-orchestrator alpha-orchestrator agent:settings`
				.quiet()
				.nothrow();
		if (settings.exitCode !== 0) {
			console.error(
				settings.stderr.toString() || "alpha-orchestrator is not running",
			);
			process.exit(settings.exitCode);
		}
		const env = evalEnv(settings.stdout.toString());
		console.error(
			`decision ${env.DECISION_MODEL} @ ${env.DECISION_BASE_URL}\nfunction call ${env.FUNCTION_CALL_MODEL} @ ${env.FUNCTION_CALL_BASE_URL}`,
		);
		const { exitCode } =
			await $`bun ${script} ${flags.misses ? ["--misses"] : []}`
				.cwd(CORE)
				.env({ ...process.env, ...env })
				.nothrow();
		process.exit(exitCode);
	},
});
