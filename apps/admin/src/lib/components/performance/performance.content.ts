import { type Dictionary, insert, t } from "intlayer";

const performanceContent = {
	key: "performance",
	content: {
		title: t({ ru: "Производительность", en: "Performance", kk: "Өнімділік" }),
		subtitle: t({
			ru: "Задержки вызовов моделей за 30 дней из журнала расхода. Перцентили включают упавшие вызовы.",
			en: "Model call latency over 30 days from the usage ledger. Percentiles include failed calls.",
			kk: "Шығын журналынан 30 күндегі модель шақыруларының кідірісі. Перцентильдер сәтсіз шақыруларды да қамтиды.",
		}),
		hints: {
			generate: t({
				ru: "beta-text: ответ пользователю",
				en: "beta-text: answer to the user",
				kk: "beta-text: пайдаланушыға жауап",
			}),
			ingest: t({
				ru: "beta-text: конспект части длинного сообщения",
				en: "beta-text: digest of a long message's part",
				kk: "beta-text: ұзын хабарлама бөлігінің конспектісі",
			}),
			decision: t({
				ru: "gamma-decision: typed decision",
				en: "gamma-decision: typed decision",
				kk: "gamma-decision: typed decision",
			}),
		},
		p50: t({
			ru: insert("p50 {{value}}"),
			en: insert("p50 {{value}}"),
			kk: insert("p50 {{value}}"),
		}),
		summary: t({
			ru: insert("p90 {{p90}} · p99 {{p99}} · {{calls}} вызовов"),
			en: insert("p90 {{p90}} · p99 {{p99}} · {{calls}} calls"),
			kk: insert("p90 {{p90}} · p99 {{p99}} · {{calls}} шақыру"),
		}),
		failed: t({
			ru: insert(", ошибок {{count}}"),
			en: insert(", {{count}} failed"),
			kk: insert(", қате {{count}}"),
		}),
		tokensPerSecond: t({
			ru: insert("· {{value}} ток/с"),
			en: insert("· {{value}} tok/s"),
			kk: insert("· {{value}} ток/с"),
		}),
		noCalls: t({
			ru: "вызовов не было",
			en: "no calls",
			kk: "шақырулар болмады",
		}),
		chartTitle: t({
			ru: "Перцентили задержки по дням",
			en: "Latency percentiles per day",
			kk: "Күн бойынша кідіріс перцентильдері",
		}),
		empty: t({
			ru: "За период вызовов не было",
			en: "No calls in this period",
			kk: "Бұл кезеңде шақырулар болмады",
		}),
		columns: {
			day: t({ ru: "День", en: "Day", kk: "Күн" }),
			calls: t({ ru: "Вызовов", en: "Calls", kk: "Шақырулар" }),
			failed: t({ ru: "Ошибок", en: "Failed", kk: "Қателер" }),
			tokensPerSecond: t({
				ru: "ток/с (медиана)",
				en: "tok/s (median)",
				kk: "ток/с (медиана)",
			}),
		},
	},
} satisfies Dictionary;

export default performanceContent;
