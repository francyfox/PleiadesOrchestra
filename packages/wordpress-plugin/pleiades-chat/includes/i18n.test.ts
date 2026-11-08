import { expect, test } from "bun:test";
import {
	moPath,
	parsePo,
	phpMsgids,
	poPath,
	pot,
	potPath,
	widgetI18n,
	widgetI18nPath,
} from "../../scripts/i18n.ts";

const read = (p: string) => Bun.file(`${import.meta.dir}/../../${p}`).text();

test("widget-i18n.json is the widget's dictionary (run `bun run build` after changing i18n.ts)", async () => {
	expect(await read(widgetI18nPath)).toBe(widgetI18n());
});

test("the .pot lists every PHP string and ru_RU.po translates all of them", async () => {
	const ids = await phpMsgids();
	expect(await read(potPath)).toBe(pot(ids));
	const ru = parsePo(await read(poPath));
	expect(ids.filter((id) => !ru.get(id))).toEqual([]);
});

test("the .mo carries the Russian strings", async () => {
	const mo = Buffer.from(
		await Bun.file(`${import.meta.dir}/../../${moPath}`).arrayBuffer(),
	);
	expect(mo.readUInt32LE(0)).toBe(0x950412de);
	expect(mo.toString("utf8")).toContain("Заголовок");
});
