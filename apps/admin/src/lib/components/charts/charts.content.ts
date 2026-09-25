import { type Dictionary, insert, t } from "intlayer";

const chartsContent = {
	key: "charts",
	content: {
		inputTokens: t({
			ru: "Входные токены",
			en: "Input tokens",
			kk: "Кіріс токендер",
		}),
		outputTokens: t({
			ru: "Выходные токены",
			en: "Output tokens",
			kk: "Шығыс токендер",
		}),
		noModelCalls: t({
			ru: "За период вызовов модели не было.",
			en: "No model calls in this period.",
			kk: "Бұл кезеңде модель шақырылмады.",
		}),
		noCalls: t({
			ru: "За период вызовов не было.",
			en: "No calls in this period.",
			kk: "Бұл кезеңде шақырулар болмады.",
		}),
		gaugeLabel: t({
			ru: insert("{{label}}: {{score}} из 100"),
			en: insert("{{label}}: {{score}} out of 100"),
			kk: insert("{{label}}: 100-ден {{score}}"),
		}),
	},
} satisfies Dictionary;

export default chartsContent;
