import { type Dictionary, insert, t } from "intlayer";

const channelsContent = {
	key: "channels",
	content: {
		title: t({ ru: "Каналы", en: "Channels", kk: "Арналар" }),
		columns: {
			channel: t({ ru: "Канал", en: "Channel", kk: "Арна" }),
			kind: t({ ru: "Тип", en: "Type", kk: "Түрі" }),
			access: t({ ru: "Доступ", en: "Access", kk: "Қолжетімділік" }),
			origins: t({ ru: "Домены", en: "Origins", kk: "Домендер" }),
			publishableKey: t({
				ru: "Публичный ключ",
				en: "Publishable key",
				kk: "Жария кілт",
			}),
			created: t({ ru: "Создан", en: "Created", kk: "Құрылған" }),
		},
		accessMode: {
			whitelist: t({ ru: "Белый список", en: "Whitelist", kk: "Ақ тізім" }),
			open: t({ ru: "Открытый", en: "Open", kk: "Ашық" }),
		},
		disabled: t({ ru: "отключён", en: "disabled", kk: "өшірілген" }),
		edit: t({ ru: "Изменить", en: "Edit", kk: "Өзгерту" }),
		enable: t({ ru: "Включить", en: "Enable", kk: "Қосу" }),
		disable: t({ ru: "Отключить", en: "Disable", kk: "Өшіру" }),
		rotateKeys: t({ ru: "Новые ключи", en: "New keys", kk: "Жаңа кілттер" }),
		rotateConfirm: {
			title: t({
				ru: insert("Выпустить новые ключи для «{{name}}»?"),
				en: insert("Issue new keys for “{{name}}”?"),
				kk: insert("«{{name}}» үшін жаңа кілттер шығару керек пе?"),
			}),
			description: t({
				ru: "Старые ключи перестанут работать сразу же. Секретный ключ будет показан один раз.",
				en: "The old keys stop working immediately. The secret key is shown only once.",
				kk: "Ескі кілттер бірден жұмысын тоқтатады. Құпия кілт бір рет қана көрсетіледі.",
			}),
		},
		empty: t({ ru: "Каналов нет", en: "No channels", kk: "Арналар жоқ" }),
		keys: {
			title: t({
				ru: insert("Ключи канала «{{channel}}»"),
				en: insert("Keys of channel “{{channel}}”"),
				kk: insert("«{{channel}}» арнасының кілттері"),
			}),
			once: t({
				ru: "Секретный ключ показывается один раз — сохраните его сейчас.",
				en: "The secret key is shown only once — save it now.",
				kk: "Құпия кілт бір рет қана көрсетіледі — оны қазір сақтаңыз.",
			}),
			publishable: t({ ru: "Публичный", en: "Publishable", kk: "Жария" }),
			secret: t({ ru: "Секретный", en: "Secret", kk: "Құпия" }),
		},
		create: {
			title: t({
				ru: "Новый веб-канал",
				en: "New web channel",
				kk: "Жаңа веб-арна",
			}),
			hint: t({
				ru: "Канал — любая точка входа: сайт, Telegram, Discord, Slack, CLI и т. д. Telegram и CLI создаются миграцией оркестратора. Каналы не удаляются — только отключаются.",
				en: "A channel is any entry point: a website, Telegram, Discord, Slack, CLI, etc. Telegram and CLI are created by an orchestrator migration. Channels are never deleted — only disabled.",
				kk: "Арна — кез келген кіру нүктесі: сайт, Telegram, Discord, Slack, CLI және т.б. Telegram мен CLI оркестратор миграциясымен құрылады. Арналар жойылмайды — тек өшіріледі.",
			}),
			name: t({ ru: "Название", en: "Name", kk: "Атауы" }),
			origins: t({
				ru: "Разрешённые домены (по одному в строке)",
				en: "Allowed origins (one per line)",
				kk: "Рұқсат етілген домендер (әр жолға біреуден)",
			}),
		},
		editTitle: t({
			ru: insert("Канал «{{name}}»"),
			en: insert("Channel “{{name}}”"),
			kk: insert("«{{name}}» арнасы"),
		}),
		allowedOrigins: t({
			ru: "Разрешённые домены",
			en: "Allowed origins",
			kk: "Рұқсат етілген домендер",
		}),
		errors: {
			invalid_channel: t({
				ru: "Slug — строчные латинские буквы, цифры и дефис; имя обязательно",
				en: "Slug: lowercase latin letters, digits and dashes; name is required",
				kk: "Slug — кіші латын әріптері, цифрлар және дефис; атауы міндетті",
			}),
		},
	},
} satisfies Dictionary;

export default channelsContent;
