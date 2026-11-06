#!/usr/bin/env bun
import { createCLI } from "@bunli/core";
import { commands } from "./commands.ts";
import { renderHelp } from "./help.ts";
import { resolveVersion } from "./version.ts";

const version = resolveVersion();
const first = Bun.argv[2];

// Plain text in a terminal and in a pipe (the framework prints a JSON envelope when stdout is not a TTY).
if (first === "-v" || first === "--version") {
	console.log(`albedo ${version}`);
	process.exit(0);
}
if (first === undefined || first === "-h" || first === "--help") {
	console.log(renderHelp("albedo", version, commands));
	process.exit(0);
}

const cli = await createCLI({
	name: "albedo",
	version,
	description: "CLI for talking to a running harness instance",
});

for (const command of commands) cli.command(command);

await cli.run();
