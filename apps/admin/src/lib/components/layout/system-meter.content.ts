import { type Dictionary, insert, t } from "intlayer";

const systemMeterContent = {
	key: "system-meter",
	content: {
		cores: t({
			ru: insert("{{physical}}/{{logical}} ядер"),
			en: insert("{{physical}}/{{logical}} cores"),
			kk: insert("{{physical}}/{{logical}} ядро"),
		}),
		umaHint: t({
			ru: "UMA: GPU делит оперативную память; GTT — память системы, отданная GPU",
			en: "UMA: the GPU shares system RAM; GTT is system memory mapped for the GPU",
			kk: "UMA: GPU жедел жадыны ортақ пайдаланады; GTT — GPU-ға берілген жүйе жады",
		}),
		noGpu: t({ ru: "нет", en: "none", kk: "жоқ" }),
	},
} satisfies Dictionary;

export default systemMeterContent;
