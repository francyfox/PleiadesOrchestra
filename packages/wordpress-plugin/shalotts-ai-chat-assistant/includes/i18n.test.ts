import { expect, test } from "bun:test";
import {
	phpMsgids,
	pot,
	potPath,
	widgetI18n,
	widgetI18nPath,
} from "../../scripts/i18n.ts";

const read = (p: string) => Bun.file(`${import.meta.dir}/../../${p}`).text();

test("widget-i18n.json is the widget's dictionary (run `bun run build` after changing i18n.ts)", async () => {
	expect(await read(widgetI18nPath)).toBe(widgetI18n());
});

test("the .pot lists every PHP string", async () => {
	const ids = await phpMsgids();
	expect(await read(potPath)).toBe(pot(ids));
});
