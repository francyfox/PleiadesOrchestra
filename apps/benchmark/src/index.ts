#!/usr/bin/env bun
import { createCLI } from "@bunli/core";
import choices from "./modules/choices/choices.command.ts";
import { menuText, pick } from "./modules/menu/menu.service.ts";
import snake from "./modules/snake/snake.command.ts";
import tools from "./modules/tools/tools.command.ts";

// Every benchmark of the repo: `bun start` asks which one, `bun start tools …`
// `bun start laya …` or `bun start snake …` runs it directly (`--help` after the name lists flags).

const commands = [tools, choices, snake];

const cli = await createCLI({
	name: "benchmark",
	version: "0.1.0",
	description: "Benchmarks of the small models",
});
for (const command of commands) cli.command(command);

const argv = process.argv.slice(2);
if (argv.length === 0 && process.stdin.isTTY) {
	// A plain prompt, not bunli's select: that one keeps a full-screen
	// session (OpenTUI) open until exit, which would wipe the results.
	console.log(menuText(commands));
	const name = pick(prompt("Which one?"), commands);
	if (!name) process.exit(1);
	await cli.run([name]);
} else {
	await cli.run(argv);
}
