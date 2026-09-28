import { type Dictionary, t } from "intlayer";

/**
 * Answers use blank lines between paragraphs and "1. …" lines for steps
 * (rendered with `whitespace-pre-line`). The code samples under "connect"
 * and "keys" are in faq-code.ts — they are the same in every language.
 */
const faqContent = {
	key: "faq",
	content: {
		title: t({ ru: "FAQ", en: "FAQ", kk: "FAQ" }),
		subtitle: t({
			ru: "Как подключить виджет чата к сайту и ответы на частые вопросы.",
			en: "How to connect the chat widget to a site, and answers to common questions.",
			kk: "Чат виджетін сайтқа қалай қосу керек және жиі қойылатын сұрақтарға жауаптар.",
		}),
		start: {
			title: t({
				ru: "Как начать",
				en: "Getting started",
				kk: "Қалай бастау керек",
			}),
			steps: t({
				ru: "1. На странице «Каналы» создайте веб-канал и добавьте адрес вашего сайта (например, https://shop.example.com) в его разрешённые домены.\n2. Разместите файл pleiades-widget.js (собирается из packages/pleiades-widget) на своём сайте или CDN.\n3. Вставьте код ниже на страницы сайта. Кнопка «Код для сайта» в строке канала на странице «Каналы» выдаёт тот же код с уже подставленным публичным ключом.",
				en: "1. On the Channels page, create a web channel and add your site's address (for example https://shop.example.com) to its allowed origins.\n2. Host the pleiades-widget.js file (built from packages/pleiades-widget) on your site or a CDN.\n3. Paste the code below into your pages. The “Embed code” button on the channel's row of the Channels page gives you the same code with the public key already filled in.",
				kk: "1. «Арналар» бетінде веб-арна құрып, сайтыңыздың мекенжайын (мысалы, https://shop.example.com) оның рұқсат етілген домендеріне қосыңыз.\n2. pleiades-widget.js файлын (packages/pleiades-widget ішінен жиналады) өз сайтыңызға немесе CDN-ге орналастырыңыз.\n3. Төмендегі кодты сайт беттеріне қойыңыз. «Арналар» бетіндегі арна жолындағы «Сайтқа арналған код» түймесі жария кілті дайын қойылған сол кодты береді.",
			}),
			attributes: {
				title: t({
					ru: "Атрибуты <pleiades-chat>",
					en: "<pleiades-chat> attributes",
					kk: "<pleiades-chat> атрибуттары",
				}),
				columns: {
					name: t({ ru: "Имя", en: "Name", kk: "Аты" }),
					type: t({ ru: "Тип", en: "Type", kk: "Түрі" }),
					default: t({ ru: "По умолчанию", en: "Default", kk: "Әдепкі" }),
					description: t({
						ru: "Описание",
						en: "Description",
						kk: "Сипаттама",
					}),
				},
				required: t({ ru: "обязателен", en: "required", kk: "міндетті" }),
				byLanguage: t({ ru: "по языку", en: "by language", kk: "тілге қарай" }),
				pageLanguage: t({
					ru: "язык страницы",
					en: "page language",
					kk: "бет тілі",
				}),
				rows: {
					agentUrl: t({
						ru: "Публичный https-адрес оркестратора (http допускается только для localhost).",
						en: "Public https URL of the orchestrator (plain http only for localhost).",
						kk: "Оркестратордың жария https мекенжайы (http тек localhost үшін).",
					}),
					publishableKey: t({
						ru: "Публичный ключ канала (pk_…). Секретный ключ (sk_…) виджет не принимает.",
						en: "The channel's public key (pk_…). The widget refuses a secret key (sk_…).",
						kk: "Арнаның жария кілті (pk_…). Виджет құпия кілтті (sk_…) қабылдамайды.",
					}),
					position: t({
						ru: "Угол, в котором стоит кнопка чата; панель выезжает с той же стороны.",
						en: "The corner of the chat button; the panel slides in from the same side.",
						kk: "Чат түймесінің бұрышы; панель сол жақтан шығады.",
					}),
					heading: t({
						ru: "Заголовок панели.",
						en: "Panel title.",
						kk: "Панель тақырыбы.",
					}),
					greeting: t({
						ru: "Первое сообщение в чате.",
						en: "The first message of the conversation.",
						kk: "Сұхбаттағы алғашқы хабарлама.",
					}),
					placeholder: t({
						ru: "Подсказка в поле ввода.",
						en: "Hint in the message box.",
						kk: "Хабарлама жолындағы кеңес.",
					}),
					lang: t({
						ru: "Язык виджета; неподдерживаемый язык заменяется английским.",
						en: "Widget language; an unsupported one falls back to English.",
						kk: "Виджет тілі; қолдау көрсетілмейтін тіл ағылшынға ауыстырылады.",
					}),
					open: t({
						ru: "Панель открыта при загрузке. Есть и свойство el.open, и метод el.toggle().",
						en: "The panel is open on load. Also the el.open property and the el.toggle() method.",
						kk: "Панель жүктелгенде ашық. el.open қасиеті және el.toggle() әдісі де бар.",
					}),
				},
			},
		},
		search: {
			label: t({
				ru: "Поиск по вопросам",
				en: "Search the questions",
				kk: "Сұрақтар бойынша іздеу",
			}),
			placeholder: t({
				ru: "Поиск по вопросам…",
				en: "Search the questions…",
				kk: "Сұрақтар бойынша іздеу…",
			}),
			empty: t({
				ru: "Ничего не найдено.",
				en: "Nothing found.",
				kk: "Ештеңе табылмады.",
			}),
		},
		questionsTitle: t({
			ru: "Вопросы и ответы",
			en: "Questions and answers",
			kk: "Сұрақ-жауаптар",
		}),
		items: {
			keys: {
				q: t({
					ru: "Какой ключ куда: публичный или секретный?",
					en: "Which key goes where — public or secret?",
					kk: "Қай кілт қайда: жария ма, құпия ма?",
				}),
				a: t({
					ru: "Публичный ключ (pk_…) идёт в страницу: атрибут publishable-key у <pleiades-chat>. Его видят все посетители, и это нормально: канал защищают список разрешённых доменов, токены посетителей и лимиты.\n\nСекретный ключ (sk_…) нужен только серверу вашего сайта — для вызова identify, который привязывает посетителя к аккаунту (пример ниже). Он показывается один раз, при создании канала или смене ключей. Никогда не кладите его в страницу, в переменные VITE_… или в приложение: виджет с ним не запустится. Если ключ утёк, нажмите «Новые ключи» на странице «Каналы».",
					en: "The public key (pk_…) goes into the page: the publishable-key attribute of <pleiades-chat>. Every visitor can see it, and that is fine: what protects the channel is the list of allowed origins, visitor tokens and rate limits.\n\nThe secret key (sk_…) belongs only on your site's server, for the identify call that links a visitor to a logged-in account (example below). It is shown once, when a channel is created or its keys are rotated. Never put it in a page, a VITE_… variable or an app — the widget refuses to start with it. If it leaked, use “New keys” on the Channels page.",
					kk: "Жария кілт (pk_…) бетке қойылады: <pleiades-chat> тегінің publishable-key атрибуты. Оны барлық келушілер көреді, бұл қалыпты: арнаны рұқсат етілген домендер тізімі, келуші токендері және лимиттер қорғайды.\n\nҚұпия кілт (sk_…) тек сайт серверіне қажет — келушіні аккаунтқа байлайтын identify шақыруы үшін (мысал төменде). Ол арна құрылғанда немесе кілттер ауыстырылғанда бір рет көрсетіледі. Оны ешқашан бетке, VITE_… айнымалыларына немесе қолданбаға салмаңыз: виджет онымен іске қосылмайды. Кілт ағып кетсе, «Арналар» бетінде «Жаңа кілттер» түймесін басыңыз.",
				}),
			},
			agentUrl: {
				q: t({
					ru: "Что писать в agent-url?",
					en: "What do I put in agent-url?",
					kk: "agent-url ішіне не жазу керек?",
				}),
				a: t({
					ru: "Публичный https-адрес оркестратора (alpha-orchestrator, по умолчанию порт 3000), до которого дотянутся браузеры посетителей. Это не адрес админки и не внутренний адрес Docker. Обычный http принимается только для localhost.",
					en: "The public https address of the orchestrator (alpha-orchestrator, port 3000 by default) that your visitors' browsers can reach. Not the admin panel and not an internal Docker address. Plain http is accepted only for localhost.",
					kk: "Келушілер браузері жете алатын оркестратордың (alpha-orchestrator, әдепкіде 3000 порты) жария https мекенжайы. Бұл әкімші панелінің де, Docker ішкі мекенжайының да емес. Жай http тек localhost үшін қабылданады.",
				}),
			},
			silent: {
				q: t({
					ru: "Виджет не появляется. Что проверить?",
					en: "The widget doesn't appear. What do I check?",
					kk: "Виджет пайда болмайды. Нені тексеру керек?",
				}),
				a: t({
					ru: "Откройте консоль браузера: при неверной настройке виджет ничего не рисует и пишет одну строку, начинающуюся с [pleiades-widget], с кодом ошибки:\n- missing_agent_url, invalid_agent_url — не задан или неверен agent-url;\n- insecure_agent_url — agent-url должен быть https;\n- missing_key, invalid_key — нужен публичный ключ pk_…;\n- secret_key — вставлен секретный ключ; замените его на публичный и смените ключи.\n\nТакже убедитесь, что скрипт загрузился: элемент <pleiades-chat> появляется только после выполнения pleiades-widget.js.",
					en: "Open the browser console: a wrong configuration renders nothing and logs one line starting with [pleiades-widget], with an error code:\n- missing_agent_url, invalid_agent_url — agent-url is missing or malformed;\n- insecure_agent_url — agent-url must be https;\n- missing_key, invalid_key — the public pk_… key is needed;\n- secret_key — a secret key was pasted; replace it with the public one and rotate the keys.\n\nAlso make sure the script loaded: the <pleiades-chat> element only comes alive after pleiades-widget.js runs.",
					kk: "Браузер консолін ашыңыз: дұрыс емес баптауда виджет ештеңе салмайды және [pleiades-widget] деп басталатын, қате коды бар бір жол жазады:\n- missing_agent_url, invalid_agent_url — agent-url жоқ немесе қате;\n- insecure_agent_url — agent-url https болуы керек;\n- missing_key, invalid_key — жария pk_… кілті керек;\n- secret_key — құпия кілт қойылған; оны жарияға ауыстырып, кілттерді жаңартыңыз.\n\nСондай-ақ скрипттің жүктелгенін тексеріңіз: <pleiades-chat> элементі pleiades-widget.js орындалғаннан кейін ғана жұмыс істейді.",
				}),
			},
			noConnection: {
				q: t({
					ru: "Виджет пишет «Нет соединения», хотя сервер работает.",
					en: "The widget says “No connection”, but the server is running.",
					kk: "Сервер жұмыс істеп тұр, бірақ виджет «Байланыс жоқ» деп жазады.",
				}),
				a: t({
					ru: "Чаще всего адрес сайта не входит в разрешённые домены канала: сервер отвечает 403 без CORS-заголовков, и браузер показывает это как сетевую ошибку. Добавьте точный адрес, с которого открывается страница (схема, хост и порт; http://localhost:5173 и http://127.0.0.1:5173 — разные адреса), через «Изменить» у канала.\n\nДругие причины: смешанное содержимое (страница по https не может обращаться к http-оркестратору), заблокированный IP или отключённый канал.",
					en: "Most often the site's origin is not in the channel's allowed origins: the server then answers 403 without CORS headers, so the browser reports it as a network error. Add the exact address the page is opened from (scheme, host and port; http://localhost:5173 and http://127.0.0.1:5173 are different) to the channel via “Edit”.\n\nOther causes: mixed content (an https page cannot call an http orchestrator), a blocked IP, or a disabled channel.",
					kk: "Көбіне сайт мекенжайы арнаның рұқсат етілген домендерінде болмайды: сервер CORS тақырыптарынсыз 403 қайтарады, ал браузер мұны желі қатесі ретінде көрсетеді. Бет ашылатын нақты мекенжайды (схема, хост және порт; http://localhost:5173 мен http://127.0.0.1:5173 — әртүрлі мекенжайлар) арнаның «Өзгерту» түймесі арқылы қосыңыз.\n\nБасқа себептер: аралас мазмұн (https беті http оркестраторға жүгіне алмайды), бұғатталған IP немесе өшірілген арна.",
				}),
			},
			noDelete: {
				q: t({
					ru: "Почему канал нельзя удалить?",
					en: "Why can't I delete a channel?",
					kk: "Арнаны неге жоюға болмайды?",
				}),
				a: t({
					ru: "Каналы только отключают, но не удаляют: так сохраняются их пользователи, история и статистика расхода. Отключённый канал отклоняет новые запросы; включить его можно в любой момент. Чтобы отрезать утёкший ключ, используйте «Новые ключи» — старые перестают работать сразу.",
					en: "Channels are only disabled, never deleted: that keeps their users, history and usage statistics. A disabled channel refuses new requests; you can enable it again at any time. To cut off a leaked key, use “New keys” — the old ones stop working at once.",
					kk: "Арналар тек өшіріледі, жойылмайды: сонда олардың пайдаланушылары, тарихы және шығын статистикасы сақталады. Өшірілген арна жаңа сұраныстарды қабылдамайды; оны кез келген уақытта қосуға болады. Ағып кеткен кілтті кесу үшін «Жаңа кілттер» түймесін пайдаланыңыз — ескілері бірден жұмыс істемейді.",
				}),
			},
			access: {
				q: t({
					ru: "Чем «Белый список» отличается от «Открытый»?",
					en: "What is the difference between “Whitelist” and “Open” access?",
					kk: "«Ақ тізім» мен «Ашық» қолжетімділіктің айырмашылығы неде?",
				}),
				a: t({
					ru: "В открытом канале писать может любой, кто до него дотянулся (посетители веб-виджета анонимны). В канале с белым списком — только пользователи, которых вы допустили на странице «Пользователи»; остальным в ответ тишина, и модель не вызывается. Заблокированный пользователь получает отказ в обоих режимах.",
					en: "In an open channel anyone who reaches it can chat (web widget visitors are anonymous). In a whitelist channel only users you have allowed on the Users page can; everyone else gets silence and the model is never called. A blocked user is refused in both modes.",
					kk: "Ашық арнада оған жеткен кез келген адам жаза алады (веб-виджет келушілері анонимді). Ақ тізімді арнада тек «Пайдаланушылар» бетінде рұқсат берген пайдаланушылар жаза алады; қалғандарына үнсіздік, модель шақырылмайды. Бұғатталған пайдаланушыға екі режимде де бас тартылады.",
				}),
			},
			ipBlocks: {
				q: t({
					ru: "Как работают блокировки по IP?",
					en: "How do IP blocks work?",
					kk: "IP бойынша бұғаттау қалай жұмыс істейді?",
				}),
				a: t({
					ru: "Блокировка сверяется по солёному хешу IP, поэтому работает и для анонимных посетителей; сам IP хранится только чтобы вы его видели и могли открыть whois. У каждой блокировки есть срок, потому что адреса бывают общими (офисы, мобильные сети). Заблокировать IP можно прямо из строки пользователя на странице «Пользователи». Анонимные посетители и их IP удаляются после суток неактивности.",
					en: "A block matches by a salted hash of the IP, so it works for anonymous visitors; the plain IP is stored only so you can see it and open a whois lookup. Every block has an expiry, because addresses are shared (offices, mobile networks). You can block an IP straight from a user's row on the Users page. Anonymous visitors and their IP are deleted after a day of inactivity.",
					kk: "Бұғаттау IP-дің тұздалған хеші бойынша салыстырылады, сондықтан анонимді келушілерге де жұмыс істейді; IP-дің өзі оны көру және whois ашу үшін ғана сақталады. Әр бұғаттаудың мерзімі бар, себебі мекенжайлар ортақ болады (кеңселер, мобильді желілер). IP-ді «Пайдаланушылар» бетіндегі пайдаланушы жолынан тікелей бұғаттауға болады. Анонимді келушілер мен олардың IP-і бір тәулік белсенділіксіз болғаннан кейін жойылады.",
				}),
			},
			superAdmin: {
				q: t({
					ru: "Что может супер-администратор, чего не могут остальные?",
					en: "What can the super admin do that other admins can't?",
					kk: "Супер-әкімші не істей алады, ал басқалар істей алмайды?",
				}),
				a: t({
					ru: "Супер-администратор — первая созданная учётная запись. Только он может удалять других администраторов. Никто другой не может удалить супер-администратора, заблокировать его или сменить ему пароль. Любой администратор может создавать администраторов, менять пароли и блокировать обычных администраторов (но не себя и не последнего активного).",
					en: "The super admin is the first account created. Only they can delete other admins. Nobody else can delete, ban or change the password of the super admin. Any admin can create admins, and change the passwords of and ban regular admins (but never themselves, and never the last active one).",
					kk: "Супер-әкімші — алғаш құрылған тіркелгі. Басқа әкімшілерді тек ол жоя алады. Супер-әкімшіні ешкім жоя алмайды, бұғаттай алмайды және құпиясөзін өзгерте алмайды. Кез келген әкімші әкімшілер құра алады, қарапайым әкімшілердің құпиясөзін өзгертіп, оларды бұғаттай алады (бірақ өзін де, соңғы белсендіні де емес).",
				}),
			},
		},
	},
} satisfies Dictionary;

export default faqContent;
