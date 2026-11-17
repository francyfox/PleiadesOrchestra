// Copies the built widget into the plugin, regenerates the .pot and zips it (dist/shalotts-ai-chat-assistant.zip).
import { cp, mkdir, rm } from "node:fs/promises";
import { phpMsgids, pot, potPath, widgetI18n, widgetI18nPath } from "./i18n.ts";

const widget = "../../packages/pleiades-widget";
const assets = "shalotts-ai-chat-assistant/assets/js";
await cp(`${widget}/dist/pleiades-widget.js`, `${assets}/pleiades-widget.js`);
await cp(`${widget}/LICENSE`, `${assets}/pleiades-widget.LICENSE.txt`);

await Bun.write(widgetI18nPath, widgetI18n());
const ids = await phpMsgids();
await Bun.write(potPath, pot(ids));

await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });
// `*.test.ts` stays out of the shipped plugin.
await Bun.$`zip -qr dist/shalotts-ai-chat-assistant.zip shalotts-ai-chat-assistant -x "*.test.ts"`;
console.log("dist/shalotts-ai-chat-assistant.zip");
