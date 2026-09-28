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
		overall: t({ ru: "Нагрузка", en: "Load", kk: "Жүктеме" }),
		overallHint: t({
			ru: "Худший из показателей CPU / RAM / GPU / VRAM: зелёный < 70%, жёлтый 70–90%, красный от 90%",
			en: "The worst of CPU / RAM / GPU / VRAM: green < 70%, yellow 70–90%, red from 90%",
			kk: "CPU / RAM / GPU / VRAM ішіндегі ең нашары: жасыл < 70%, сары 70–90%, қызыл 90%-дан",
		}),
		levels: {
			ok: t({ ru: "норма", en: "normal", kk: "қалыпты" }),
			warn: t({ ru: "высокая", en: "high", kk: "жоғары" }),
			critical: t({ ru: "критическая", en: "critical", kk: "сыни" }),
			unknown: t({ ru: "нет данных", en: "no data", kk: "дерек жоқ" }),
		},
	},
} satisfies Dictionary;

export default systemMeterContent;
