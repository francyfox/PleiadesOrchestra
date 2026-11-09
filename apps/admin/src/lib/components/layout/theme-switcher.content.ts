import { type Dictionary, t } from "intlayer";

const themeSwitcherContent = {
	key: "theme-switcher",
	content: {
		label: t({
			ru: "Сменить тему",
			en: "Toggle theme",
			kk: "Тақырыпты ауыстыру",
		}),
	},
} satisfies Dictionary;

export default themeSwitcherContent;
