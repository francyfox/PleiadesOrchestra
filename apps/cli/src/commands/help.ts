import { defineCommand } from "@bunli/core";
import { commands } from "../commands.ts";
import { renderHelp } from "../help.ts";
import { resolveVersion } from "../version.ts";

export const helpCommand = defineCommand({
	name: "help",
	alias: "h",
	description: "Show the commands, their shortcuts and options",
	handler: () => {
		console.log(renderHelp("albedo", resolveVersion(), commands));
	},
});
