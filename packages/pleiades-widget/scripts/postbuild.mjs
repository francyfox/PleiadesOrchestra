// After `vite build`: the typings travel next to the bundle, and the bundle points at them with
// `@ts-self-types` (how JSR and Deno pair a `.js` entry with its types).
//
//   dist/       for npm: the typings as written (`types/index.d.ts`, with the `declare global`
//               that types `document.createElement("pleiades-chat")`).
//   dist-jsr/   for JSR: the same bundle with typings minus the global augmentation, which JSR
//               refuses to publish.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const types = readFileSync("types/index.d.ts", "utf8");
const pragma = '// @ts-self-types="./pleiades-widget.d.ts"\n';
const bundle =
	pragma + readFileSync("dist/pleiades-widget.js", "utf8").replace(pragma, "");

writeFileSync("dist/pleiades-widget.js", bundle);
writeFileSync("dist/pleiades-widget.d.ts", types);

const withoutGlobal = types.replace(/^declare global \{[\s\S]*?^\}\n?/m, "");
if (withoutGlobal === types || withoutGlobal.includes("declare global"))
	throw new Error(
		"types/index.d.ts: the `declare global` block was not found or not removed",
	);

mkdirSync("dist-jsr", { recursive: true });
writeFileSync("dist-jsr/pleiades-widget.js", bundle);
writeFileSync("dist-jsr/pleiades-widget.d.ts", withoutGlobal);
