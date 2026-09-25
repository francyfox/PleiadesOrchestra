import { type Dictionary, t } from "intlayer";

const localeSwitcherContent = {
	key: "locale-switcher",
	content: {
		label: t({ ru: "Язык", en: "Language", kk: "Тіл" }),
	},
} satisfies Dictionary;

export default localeSwitcherContent;
