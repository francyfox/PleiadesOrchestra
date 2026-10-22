export interface MenuItem {
	name: string;
	description?: string;
}

/** The numbered list shown when no benchmark is named on the command line. */
export function menuText(items: MenuItem[]): string {
	const lines = items.map(
		(item, i) =>
			`  ${i + 1}) ${item.name.padEnd(10)} ${item.description ?? ""}`,
	);
	return ["📊 Benchmarks", "", ...lines, ""].join("\n");
}

/** The benchmark an answer names, by number or by name. */
export function pick(
	answer: string | null,
	items: MenuItem[],
): string | undefined {
	const value = answer?.trim() ?? "";
	const byNumber = /^\d+$/.test(value) ? items[Number(value) - 1] : undefined;
	return (byNumber ?? items.find((item) => item.name === value))?.name;
}
