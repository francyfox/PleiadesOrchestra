import { type Dictionary, t } from "intlayer";

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
		spend: t({ ru: "Расход, $", en: "Spend, $", kk: "Шығын, $" }),
		spendTr: t({ ru: "Расход, TR", en: "Spend, TR", kk: "Шығын, TR" }),
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
	},
} satisfies Dictionary;

export default chartsContent;
