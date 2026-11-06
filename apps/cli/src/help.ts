interface Described {
	name: string;
	description: string;
	alias?: string | readonly string[];
	options?: Record<string, { description?: string; short?: string }>;
}

const flag = (name: string, short?: string) =>
	`--${name}${short ? `, -${short}` : ""}`;

/** Plain-text help: the commands with their shortcuts and options, then the flags every command takes. Same in a terminal and a pipe. */
export function renderHelp(
	cliName: string,
	version: string,
	commands: readonly Described[],
): string {
	const lines = [
		`${cliName} ${version}`,
		"CLI for talking to a running harness instance",
		"",
		`Usage: ${cliName} <command> [options]`,
		"",
		"Commands (shortcut in brackets):",
	];
	for (const command of commands) {
		const alias = [command.alias ?? []].flat().join(", ");
		lines.push(
			`  ${command.name}${alias ? ` [${alias}]` : ""}`,
			`      ${command.description}`,
		);
		for (const [name, option] of Object.entries(command.options ?? {}))
			lines.push(
				`      ${flag(name, option.short).padEnd(18)} ${option.description ?? ""}`.trimEnd(),
			);
	}
	lines.push(
		"",
		"Options:",
		`  ${flag("version", "v").padEnd(18)} Print the version`,
		`  ${flag("help", "h").padEnd(18)} Print this help (\`${cliName} <command> --help\` for one command)`,
		"",
		"Environment: HARNESS_API_KEY (required for send/reset), HARNESS_BASE_URL (default http://localhost:3000), PLEIADES_VERSION.",
	);
	return lines.join("\n");
}
