import { expect, test } from "bun:test";
import channelsContent from "./channels.content.ts";

// svelte-check cannot see into the dictionary (`$content.x.y` is untyped), so a key the
// component reads but the dictionary lost only fails in the browser. This catches it here.
test("every `$content.intentSets.<key>` the field reads exists in the channels dictionary", async () => {
	const source = await Bun.file(
		`${import.meta.dir}/intent-sets-field.svelte`,
	).text();
	const read = [...source.matchAll(/\$content\.intentSets\.(\w+)/g)].map(
		(match) => match[1] as string,
	);
	const have = Object.keys(
		(channelsContent.content as { intentSets: Record<string, unknown> })
			.intentSets,
	);
	expect(read.length).toBeGreaterThan(0);
	for (const key of read) expect(have).toContain(key);
});
