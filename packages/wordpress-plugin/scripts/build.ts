// Copies the built widget into the plugin and zips it (dist/pleiades-assistant.zip).
import { cp, mkdir, rm } from "node:fs/promises";

const widget = "../../packages/pleiades-widget";
const assets = "pleiades-assistant/assets";
await cp(`${widget}/dist/pleiades-widget.js`, `${assets}/pleiades-widget.js`);
await cp(`${widget}/LICENSE`, `${assets}/pleiades-widget.LICENSE.txt`);
await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });
// `*.test.ts` stays out of the shipped plugin.
await Bun.$`zip -qr dist/pleiades-assistant.zip pleiades-assistant -x "*.test.ts"`;
console.log("dist/pleiades-assistant.zip");
