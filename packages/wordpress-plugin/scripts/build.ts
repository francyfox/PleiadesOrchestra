// Copies the built widget into the plugin, regenerates the i18n files and zips it (dist/wp-pleiades-plugin.zip).
import { cp, mkdir, rm } from "node:fs/promises";
import {
	mo,
	moPath,
	parsePo,
	phpMsgids,
	poPath,
	pot,
	potPath,
	widgetI18n,
	widgetI18nPath,
} from "./i18n.ts";

const widget = "../../packages/pleiades-widget";
const assets = "wp-pleiades-plugin/assets/js";
await cp(`${widget}/dist/pleiades-widget.js`, `${assets}/pleiades-widget.js`);
await cp(`${widget}/LICENSE`, `${assets}/pleiades-widget.LICENSE.txt`);

await Bun.write(widgetI18nPath, widgetI18n());
const ids = await phpMsgids();
await Bun.write(potPath, pot(ids));
const ru = parsePo(await Bun.file(poPath).text());
const missing = ids.filter((id) => !ru.get(id));
if (missing.length) throw new Error(`ru_RU.po lacks: ${missing.join(" | ")}`);
await Bun.write(moPath, mo(ru));

await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });
// `*.test.ts` stays out of the shipped plugin.
await Bun.$`zip -qr dist/wp-pleiades-plugin.zip wp-pleiades-plugin -x "*.test.ts"`;
console.log("dist/wp-pleiades-plugin.zip");
