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
				ru: "Публичный ключ (pk_)",
				en: "Public key (pk_)",
				kk: "Жария кілт (pk_)",
			}),
			catalogLanguage: t({
				ru: "Язык каталога",
				en: "Catalog language",
				kk: "Каталог тілі",
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
			publishable: t({
				ru: "Публичный ключ (pk_…)",
				en: "Public key (pk_…)",
				kk: "Жария кілт (pk_…)",
			}),
			publishableHint: t({
				ru: "Для страницы сайта: атрибут publishable-key у <pleiades-chat>. Его видят все посетители — это нормально.",
				en: "For the site's page: the publishable-key attribute of <pleiades-chat>. Every visitor can see it — that's fine.",
				kk: "Сайт бетіне арналған: <pleiades-chat> тегінің publishable-key атрибуты. Оны барлық келушілер көреді — бұл қалыпты.",
			}),
			secret: t({
				ru: "Секретный ключ (sk_…)",
				en: "Secret key (sk_…)",
				kk: "Құпия кілт (sk_…)",
			}),
			secretHint: t({
				ru: "Только для сервера сайта (вызов identify). Никогда не кладите его в страницу, в переменные VITE_… или в приложение.",
				en: "For the site's server only (the identify call). Never put it in a page, a VITE_… variable or an app.",
				kk: "Тек сайт серверіне арналған (identify шақыруы). Оны ешқашан бетке, VITE_… айнымалыларына немесе қолданбаға салмаңыз.",
			}),
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
		embed: {
			action: t({
				ru: "Код для сайта",
				en: "Embed code",
				kk: "Сайтқа арналған код",
			}),
			title: t({
				ru: insert("Виджет на сайт «{{name}}»"),
				en: insert("Widget for “{{name}}”"),
				kk: insert("«{{name}}» сайтына виджет"),
			}),
			description: t({
				ru: "Вставьте этот код на страницы сайта. В него попадает только публичный ключ.",
				en: "Paste this into your site's pages. Only the public key goes into it.",
				kk: "Бұл кодты сайт беттеріне қойыңыз. Оған тек жария кілт кіреді.",
			}),
			agentUrl: t({
				ru: "Адрес оркестратора",
				en: "Orchestrator URL",
				kk: "Оркестратор мекенжайы",
			}),
			agentUrlHint: t({
				ru: "Публичный https-адрес, по которому браузеры посетителей достучатся до оркестратора.",
				en: "The public https URL your visitors' browsers can reach the orchestrator at.",
				kk: "Келушілер браузері оркестраторға қосыла алатын жария https мекенжайы.",
			}),
			scriptUrl: t({
				ru: "Адрес скрипта виджета",
				en: "Widget script URL",
				kk: "Виджет скриптінің мекенжайы",
			}),
			scriptUrlHint: t({
				ru: "Где сайт будет отдавать файл pleiades-widget.js (свой хостинг или CDN).",
				en: "Where the site will serve pleiades-widget.js from (your hosting or a CDN).",
				kk: "Сайт pleiades-widget.js файлын қайдан беретіні (өз хостингіңіз немесе CDN).",
			}),
			snippet: t({ ru: "Код", en: "Code", kk: "Код" }),
			copy: t({
				ru: "Скопировать код",
				en: "Copy the code",
				kk: "Кодты көшіру",
			}),
			publicOnly: t({
				ru: "Секретный ключ сюда не вставляют никогда — он только для сервера сайта.",
				en: "Never paste the secret key here — it is for the site's server only.",
				kk: "Құпия кілтті мұнда ешқашан қоспаңыз — ол тек сайт серверіне арналған.",
			}),
			origins: t({
				ru: insert(
					"Разрешённые домены канала: {{origins}}. Сайт должен открываться с одного из них.",
				),
				en: insert(
					"The channel's allowed origins: {{origins}}. The site must be served from one of them.",
				),
				kk: insert(
					"Арнаның рұқсат етілген домендері: {{origins}}. Сайт солардың бірінен ашылуы керек.",
				),
			}),
			noOrigins: t({
				ru: "У канала нет разрешённых доменов — виджет будет отклонён. Добавьте адрес сайта через «Изменить».",
				en: "This channel has no allowed origins, so the widget will be refused. Add the site's address via “Edit”.",
				kk: "Арнада рұқсат етілген домендер жоқ — виджет қабылданбайды. Сайт мекенжайын «Өзгерту» арқылы қосыңыз.",
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
		catalogLanguage: t({
			ru: "Язык каталога",
			en: "Catalog language",
			kk: "Каталог тілі",
		}),
		catalogLanguageHint: t({
			ru: "Код языка, на котором на сайте написаны названия товаров (en, ru, kk…). Поисковый запрос уходит в тул сайта именно на нём, что бы ни написал покупатель.",
			en: "Language code of the product names on the site (en, ru, kk…). The search query reaches the site's tool in exactly that language, whatever the shopper typed.",
			kk: "Сайттағы тауар атаулары жазылған тілдің коды (en, ru, kk…). Іздеу сұрауы сатып алушы не жазса да, сайт тулына дәл осы тілде жіберіледі.",
		}),
		errors: {
			invalid_language: t({
				ru: "Язык — это код из двух букв (en, ru, kk) или с регионом (pt-BR), а не название",
				en: "Language is a two-letter code (en, ru, kk), optionally with a region (pt-BR), not a name",
				kk: "Тіл — екі әріптен тұратын код (en, ru, kk) немесе аймақпен (pt-BR), атауы емес",
			}),
			invalid_channel: t({
				ru: "Slug — строчные латинские буквы, цифры и дефис; имя обязательно",
				en: "Slug: lowercase latin letters, digits and dashes; name is required",
				kk: "Slug — кіші латын әріптері, цифрлар және дефис; атауы міндетті",
			}),
		},
	},
} satisfies Dictionary;

export default channelsContent;
