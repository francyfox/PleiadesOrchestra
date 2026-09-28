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
			ru: "Только для анонимных посетителей веб-каналов. Совпадение ищется по солёному хешу IP; сам IP хранится в открытом виде лишь для того, чтобы админ его видел и мог открыть whois/геолокацию. Блокировка всегда с истечением срока — адреса бывают общими (NAT, мобильные сети).",
			en: "Only for anonymous visitors of web channels. A block is matched by the salted hash of the IP; the plain IP is stored only so admins can see it and open a whois/geo lookup. Every block expires — addresses can be shared (NAT, mobile networks).",
			kk: "Тек веб-арналардың анонимді келушілері үшін. Бұғат IP-дің тұздалған хеші бойынша салыстырылады; IP-дің өзі әкімшіге көрсету және whois/геолокацияны ашу үшін ғана ашық түрде сақталады. Әр бұғаттың мерзімі бар — мекенжайлар ортақ болуы мүмкін (NAT, мобильді желілер).",
		}),
		columns: {
			ip: t({ ru: "IP", en: "IP", kk: "IP" }),
			ipHash: t({
				ru: "Хеш (для сопоставления)",
				en: "Hash (used for matching)",
				kk: "Хеш (салыстыру үшін)",
			}),
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
		lift: t({
			ru: "Снять блокировку",
			en: "Lift block",
			kk: "Бұғатты алып тастау",
		}),
		liftDialog: {
			title: t({
				ru: "Снять блокировку?",
				en: "Lift this block?",
				kk: "Бұғатты алып тастау керек пе?",
			}),
			description: t({
				ru: "Запись будет удалена, адрес снова сможет писать в чат.",
				en: "The entry is deleted and the address can use the chat again.",
				kk: "Жазба жойылады, мекенжай чатты қайта пайдалана алады.",
			}),
		},
		copyIp: t({ ru: "Копировать IP", en: "Copy IP", kk: "IP көшіру" }),
		copyHash: t({ ru: "Копировать хеш", en: "Copy hash", kk: "Хешті көшіру" }),
		legacyIp: t({
			ru: "Старая запись: IP не сохранён, известен только хеш",
			en: "Older entry: the IP wasn't stored, only its hash is known",
			kk: "Ескі жазба: IP сақталмаған, тек хеші белгілі",
		}),
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
