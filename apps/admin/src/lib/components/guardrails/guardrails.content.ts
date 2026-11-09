import { type Dictionary, insert, t } from "intlayer";

const guardrailsContent = {
	key: "guardrails",
	content: {
		title: t({
			ru: "Защита от инъекций",
			en: "Guardrails",
			kk: "Инъекциядан қорғау",
		}),
		subtitle: t({
			ru: "Фильтр prompt-injection: сообщение, подошедшее под правило, не доходит до моделей, посетитель получает короткий отказ.",
			en: "Prompt-injection filter: a message that matches a rule never reaches the models; the visitor gets a short refusal.",
			kk: "Prompt-injection сүзгісі: ережеге сәйкес келген хабар модельдерге жетпейді, келуші қысқа бас тарту алады.",
		}),
		enabled: t({
			ru: "Фильтр включён",
			en: "Filter enabled",
			kk: "Сүзгі қосулы",
		}),
		enabledHint: t({
			ru: "По умолчанию выключен. Проверяется сообщение и его английский текст.",
			en: "Off by default. The message and its English text are checked.",
			kk: "Әдепкіде өшірулі. Хабар мен оның ағылшынша мәтіні тексеріледі.",
		}),
		editRules: t({ ru: "Правила", en: "Edit rules", kk: "Ережелер" }),
		loading: t({ ru: "Загрузка…", en: "Loading…", kk: "Жүктелуде…" }),
		dialog: {
			title: t({
				ru: "Правила фильтра",
				en: "Filter rules",
				kk: "Сүзгі ережелері",
			}),
			hint: t({
				ru: "Одно регулярное выражение JavaScript на строку, без учёта регистра. Строки с # и пустые пропускаются.",
				en: "One JavaScript regular expression per line, case-insensitive. Lines starting with # and blank lines are skipped.",
				kk: "Әр жолда бір JavaScript регулярлық өрнегі, регистрді ескермейді. # жолдары мен бос жолдар өткізіледі.",
			}),
			editorLabel: t({
				ru: "Правила фильтра",
				en: "Filter rules",
				kk: "Сүзгі ережелері",
			}),
			reset: t({
				ru: "Сбросить к стандартным",
				en: "Reset to defaults",
				kk: "Әдепкіге қайтару",
			}),
			errors: t({
				ru: insert("Ошибок в правилах: {{count}}"),
				en: insert("{{count}} rule errors"),
				kk: insert("Ережелердегі қателер: {{count}}"),
			}),
		},
	},
} satisfies Dictionary;

export default guardrailsContent;
