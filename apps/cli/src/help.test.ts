import { expect, test } from "bun:test";
import { commands } from "./commands.ts";
import { renderHelp } from "./help.ts";

test("every command has a shortcut, and shortcuts are unique and never a command's name", () => {
	const names = commands.map((command) => command.name);
	const aliases = commands.map((command) => command.alias);
	for (const alias of aliases) expect(typeof alias).toBe("string");
	expect(new Set(aliases).size).toBe(aliases.length);
	for (const alias of aliases) expect(names).not.toContain(alias as string);
});

test("help lists every command with its shortcut, description and options, and the version", () => {
	const text = renderHelp("albedo", "9.9.9", commands);
	expect(text).toContain("albedo 9.9.9");
	for (const command of commands) {
		expect(text).toContain(command.name);
		expect(text).toContain(command.alias as string);
		expect(text).toContain(command.description.split(" ")[0] as string);
	}
	// An option shows its long and short form.
	expect(text).toContain("--message, -m");
	expect(text).toContain("--version, -v");
	expect(text).toContain("--help, -h");
});
