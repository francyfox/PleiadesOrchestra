import { type Dictionary, t } from "intlayer";

const blockedIpsContent = {
	key: "blocked-ips",
	content: {
		title: t({
			ru: "Блокировки по IP",
			en: "IP blocks",
			kk: "IP бойынша бұғаттаулар",
		}),
		subtitle: t({
			ru: "Для анонимных посетителей веб-каналов. IP хранится только как хеш; срок обязателен — адреса бывают общими.",
			en: "For anonymous visitors of web channels. The IP is stored only as a hash; an expiry is required — addresses can be shared.",
			kk: "Веб-арналардың анонимді келушілері үшін. IP тек хеш ретінде сақталады; мерзім міндетті — мекенжайлар ортақ болуы мүмкін.",
		}),
		columns: {
			ipHash: t({ ru: "Хеш IP", en: "IP hash", kk: "IP хеші" }),
			channel: t({ ru: "Канал", en: "Channel", kk: "Арна" }),
			reason: t({ ru: "Причина", en: "Reason", kk: "Себебі" }),
			created: t({ ru: "Создана", en: "Created", kk: "Құрылған" }),
			expires: t({ ru: "Истекает", en: "Expires", kk: "Мерзімі бітеді" }),
		},
		allChannels: t({
			ru: "Все каналы",
			en: "All channels",
			kk: "Барлық арналар",
		}),
		lift: t({ ru: "Снять", en: "Lift", kk: "Алып тастау" }),
		empty: t({ ru: "Блокировок нет", en: "No blocks", kk: "Бұғаттаулар жоқ" }),
		form: {
			title: t({
				ru: "Заблокировать IP",
				en: "Block an IP",
				kk: "IP бұғаттау",
			}),
			ip: t({ ru: "IP-адрес", en: "IP address", kk: "IP мекенжайы" }),
			hours: t({
				ru: "Срок, часов",
				en: "Duration, hours",
				kk: "Мерзімі, сағат",
			}),
			submit: t({ ru: "Заблокировать", en: "Block", kk: "Бұғаттау" }),
		},
		errors: {
			invalid_block: t({
				ru: "IP, причина и срок (часы > 0) обязательны",
				en: "IP, reason and duration (hours > 0) are required",
				kk: "IP, себебі және мерзімі (сағат > 0) міндетті",
			}),
		},
	},
} satisfies Dictionary;

export default blockedIpsContent;
