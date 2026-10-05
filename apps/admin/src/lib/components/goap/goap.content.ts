import { type Dictionary, insert, t } from "intlayer";

const goapContent = {
	key: "goap",
	content: {
		title: t({
			ru: "GOAP — запросы",
			en: "GOAP — requests",
			kk: "GOAP — сұраулар",
		}),
		hint: t({
			ru: "Один запрос — одно сообщение пользователя: от промпта через план до ответа. Откройте запрос, чтобы увидеть его граф решения.",
			en: "One request is one user message: from the prompt through the plan to the answer. Open one to see its decision graph.",
			kk: "Бір сұрау — пайдаланушының бір хабарламасы: промптан жоспар арқылы жауапқа дейін. Шешім графын көру үшін біреуін ашыңыз.",
		}),
		requests: {
			title: t({
				ru: "Последние запросы",
				en: "Recent requests",
				kk: "Соңғы сұраулар",
			}),
			empty: t({
				ru: "Запросов пока не было",
				en: "No requests yet",
				kk: "Әзірге сұраулар болмады",
			}),
			noPrompt: t({ ru: "(без текста)", en: "(no text)", kk: "(мәтінсіз)" }),
			columns: {
				started: t({ ru: "Начат", en: "Started", kk: "Басталды" }),
				prompt: t({ ru: "Запрос", en: "Request", kk: "Сұрау" }),
				status: t({ ru: "Статус", en: "Status", kk: "Күйі" }),
				intent: t({ ru: "Намерение", en: "Intent", kk: "Ниет" }),
				steps: t({ ru: "Шаги", en: "Steps", kk: "Қадамдар" }),
				duration: t({ ru: "Время", en: "Time", kk: "Уақыт" }),
			},
			status: {
				running: t({ ru: "выполняется", en: "running", kk: "орындалуда" }),
				waiting: t({
					ru: "ждёт браузер",
					en: "waiting for browser",
					kk: "браузерді күтуде",
				}),
				succeeded: t({ ru: "готово", en: "done", kk: "дайын" }),
				failed: t({ ru: "ошибка", en: "failed", kk: "қате" }),
				abandoned: t({ ru: "брошен", en: "abandoned", kk: "тасталған" }),
			},
		},
		graph: {
			title: t({ ru: "Граф решения", en: "Decision graph", kk: "Шешім графы" }),
			hint: t({
				ru: "Слева направо: промпт → разбор → шаги плана → результат. Пунктир — перепланирование. Текущая операция подсвечена, время идёт на глазах.",
				en: "Left to right: prompt → understanding → plan steps → result. Dashed edges are replans. The operation in progress is highlighted and its time keeps counting.",
				kk: "Солдан оңға: промпт → талдау → жоспар қадамдары → нәтиже. Үзік сызық — қайта жоспарлау. Орындалып жатқан операция белгіленген, уақыты жүріп тұрады.",
			}),
			back: t({
				ru: "Все запросы",
				en: "All requests",
				kk: "Барлық сұраулар",
			}),
			notFound: t({
				ru: "Запрос не найден — возможно, его трассу уже удалили вместе с историей.",
				en: "Request not found — its trace may have been deleted with the history.",
				kk: "Сұрау табылмады — оның трассасы тарихпен бірге жойылған болуы мүмкін.",
			}),
			total: t({
				ru: insert("всего {{time}}"),
				en: insert("total {{time}}"),
				kk: insert("барлығы {{time}}"),
			}),
			replan: t({
				ru: "перепланирование",
				en: "replan",
				kk: "қайта жоспарлау",
			}),
		},
		nodeKind: {
			prompt: t({ ru: "Промпт", en: "Prompt", kk: "Промпт" }),
			understand: t({
				ru: "Разбор запроса",
				en: "Understanding",
				kk: "Сұрауды талдау",
			}),
			action: t({ ru: "Шаг", en: "Step", kk: "Қадам" }),
			result: t({ ru: "Результат", en: "Result", kk: "Нәтиже" }),
		},
		nodeStatus: {
			done: t({ ru: "выполнено", en: "done", kk: "орындалды" }),
			running: t({ ru: "выполняется", en: "running", kk: "орындалуда" }),
			browser: t({ ru: "в браузере", en: "in the browser", kk: "браузерде" }),
			failed: t({ ru: "упало", en: "failed", kk: "сәтсіз" }),
			skipped: t({ ru: "пропущено", en: "skipped", kk: "өткізілді" }),
			diverged: t({
				ru: "эффекты разошлись",
				en: "effects diverged",
				kk: "әсерлер сәйкес келмеді",
			}),
			pending: t({ ru: "впереди", en: "ahead", kk: "алда" }),
			not_reached: t({ ru: "не дошли", en: "not reached", kk: "жетпеді" }),
			reached: t({
				ru: "цель достигнута",
				en: "goal reached",
				kk: "мақсатқа жетті",
			}),
			missed: t({
				ru: "цель не достигнута",
				en: "goal missed",
				kk: "мақсатқа жетпеді",
			}),
		},
		detail: {
			title: t({
				ru: "Подробности шага",
				en: "Step details",
				kk: "Қадам мәліметтері",
			}),
			pick: t({
				ru: "Нажмите на узел графа, чтобы увидеть аргументы, ответ и вызовы моделей.",
				en: "Click a node to see its arguments, answer and model calls.",
				kk: "Аргументтерді, жауапты және модель шақыруларын көру үшін граф түйінін басыңыз.",
			}),
			status: t({ ru: "Статус", en: "Status", kk: "Күйі" }),
			time: t({ ru: "Время", en: "Time", kk: "Уақыт" }),
			text: t({ ru: "Текст", en: "Text", kk: "Мәтін" }),
			intent: t({ ru: "Намерение", en: "Intent", kk: "Ниет" }),
			goal: t({ ru: "Цель плана", en: "Plan goal", kk: "Жоспар мақсаты" }),
			tool: t({ ru: "Тул браузера", en: "Browser tool", kk: "Браузер тулы" }),
			args: t({
				ru: "Аргументы вызова",
				en: "Call arguments",
				kk: "Шақыру аргументтері",
			}),
			browser: t({
				ru: "Ответ браузера",
				en: "Browser round trip",
				kk: "Браузер жауабы",
			}),
			answer: t({ ru: "Ответ тула", en: "Tool answer", kk: "Тул жауабы" }),
			expected: t({ ru: "Ожидалось", en: "Expected", kk: "Күтілген" }),
			effects: t({ ru: "Получено", en: "Observed", kk: "Алынған" }),
			error: t({ ru: "Ошибка", en: "Error", kk: "Қате" }),
			calls: t({
				ru: "Вызовы моделей",
				en: "Model calls",
				kk: "Модель шақырулары",
			}),
			noCalls: t({
				ru: "Вызовов моделей не было",
				en: "No model calls",
				kk: "Модель шақырулары болмады",
			}),
			tokens: t({
				ru: insert("{{input}} → {{output}} ток."),
				en: insert("{{input}} → {{output}} tok."),
				kk: insert("{{input}} → {{output}} ток."),
			}),
			reply: t({
				ru: "Ответ пользователю",
				en: "Reply to the user",
				kk: "Пайдаланушыға жауап",
			}),
			noReply: t({
				ru: "Ответа нет (его сообщение уже удалено или запрос не дошёл до ответа).",
				en: "No reply (its message was already removed, or the request never got that far).",
				kk: "Жауап жоқ (хабарламасы жойылған немесе сұрау жауапқа жетпеді).",
			}),
		},
	},
} satisfies Dictionary;

export default goapContent;
