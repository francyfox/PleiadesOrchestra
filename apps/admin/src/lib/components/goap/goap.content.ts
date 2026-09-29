import { type Dictionary, insert, t } from "intlayer";

const goapContent = {
	key: "goap",
	content: {
		noPlan: t({ ru: "нет плана", en: "no plan", kk: "жоспар жоқ" }),
		nodeStatus: {
			done: t({ ru: "выполнено", en: "done", kk: "орындалды" }),
			diverged: t({
				ru: "эффекты разошлись",
				en: "effects diverged",
				kk: "әсерлер сәйкес келмеді",
			}),
			skipped: t({
				ru: "пропущено: предусловия",
				en: "skipped: preconditions",
				kk: "өткізілді: алғышарттар",
			}),
			failed: t({ ru: "упало", en: "failed", kk: "сәтсіз" }),
			started: t({ ru: "начато", en: "started", kk: "басталды" }),
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
		cost: t({
			ru: insert("cost {{cost}}"),
			en: insert("cost {{cost}}"),
			kk: insert("cost {{cost}}"),
		}),
		tokens: t({
			ru: insert("{{input}} → {{output}} ток."),
			en: insert("{{input}} → {{output}} tok."),
			kk: insert("{{input}} → {{output}} ток."),
		}),
		run: {
			title: t({ ru: "GOAP-прогон", en: "GOAP run", kk: "GOAP іске қосылымы" }),
			goal: t({
				ru: insert("цель: {{goal}}"),
				en: insert("goal: {{goal}}"),
				kk: insert("мақсат: {{goal}}"),
			}),
			attempts: t({
				ru: insert("попыток: {{count}}"),
				en: insert("attempts: {{count}}"),
				kk: insert("әрекеттер: {{count}}"),
			}),
			user: t({ ru: "пользователь", en: "user", kk: "пайдаланушы" }),
			plan: t({ ru: "План", en: "Plan", kk: "Жоспар" }),
			planHint: t({
				ru: "Одна строка — одна попытка планирования; пунктир — перепланирование.",
				en: "One row per planning attempt; dashed edges are replans.",
				kk: "Бір жол — жоспарлаудың бір әрекеті; үзік сызық — қайта жоспарлау.",
			}),
			timeline: t({ ru: "Таймлайн", en: "Timeline", kk: "Уақыт шкаласы" }),
			noActions: t({
				ru: "Ни одно действие не выполнялось.",
				en: "No action was executed.",
				kk: "Бірде-бір әрекет орындалмады.",
			}),
			effects: t({
				ru: "Ожидаемые и фактические эффекты",
				en: "Expected vs observed effects",
				kk: "Күтілген және нақты әсерлер",
			}),
			noEffects: t({
				ru: "Нет выполненных действий",
				en: "No executed actions",
				kk: "Орындалған әрекеттер жоқ",
			}),
			calls: t({
				ru: "Вызовы моделей",
				en: "Model calls",
				kk: "Модель шақырулары",
			}),
			noCalls: t({
				ru: "Вызовов не было",
				en: "No calls",
				kk: "Шақырулар болмады",
			}),
		},
		columns: {
			attempt: t({ ru: "Попытка", en: "Attempt", kk: "Әрекет" }),
			action: t({ ru: "Действие", en: "Action", kk: "Әрекет" }),
			fact: t({ ru: "Факт", en: "Fact", kk: "Факт" }),
			expected: t({ ru: "Ожидалось", en: "Expected", kk: "Күтілген" }),
			observed: t({ ru: "Получено", en: "Observed", kk: "Алынған" }),
			kind: t({ ru: "Тип", en: "Type", kk: "Түрі" }),
			model: t({ ru: "Модель", en: "Model", kk: "Модель" }),
			input: t({ ru: "Вход", en: "Input", kk: "Кіріс" }),
			output: t({ ru: "Выход", en: "Output", kk: "Шығыс" }),
			latency: t({ ru: "Латентность", en: "Latency", kk: "Кідіріс" }),
			preconditions: t({
				ru: "Предусловия",
				en: "Preconditions",
				kk: "Алғышарттар",
			}),
			effects: t({ ru: "Эффекты", en: "Effects", kk: "Әсерлер" }),
		},
		match: {
			mismatch: t({ ru: "расхождение", en: "mismatch", kk: "сәйкессіздік" }),
			extra: t({ ru: "не объявлен", en: "undeclared", kk: "жарияланбаған" }),
			ok: t({ ru: "ок", en: "ok", kk: "ок" }),
		},
		catalog: {
			title: t({
				ru: "Каталог GOAP-действий",
				en: "GOAP action catalog",
				kk: "GOAP әрекеттерінің каталогы",
			}),
			graph: t({
				ru: "Граф «факт → действие → факт»",
				en: "“fact → action → fact” graph",
				kk: "«факт → әрекет → факт» графы",
			}),
			graphHint: t({
				ru: "Колонки — глубина зависимостей; видно, какие цели вообще достижимы.",
				en: "Columns are dependency depth — shows which goals are reachable at all.",
				kk: "Бағандар — тәуелділік тереңдігі; қандай мақсаттарға жетуге болатыны көрінеді.",
			}),
			empty: t({
				ru: "Каталог пуст",
				en: "The catalog is empty",
				kk: "Каталог бос",
			}),
			dynamic: {
				title: t({
					ru: "Динамические действия пользователя",
					en: "User's dynamic actions",
					kk: "Пайдаланушының динамикалық әрекеттері",
				}),
				hint: t({
					ru: "Действия вне статического каталога — например, WebMCP-тулы, которые видел браузер посетителя. Восстановлено из истории прогонов этого пользователя, не живой список.",
					en: "Actions outside the static catalog — e.g. WebMCP tools the visitor's browser saw. Reconstructed from this user's own run history, not a live list.",
					kk: "Статикалық каталогтан тыс әрекеттер — мысалы, келуші браузері көрген WebMCP-тулдары. Осы пайдаланушының іске қосылымдар тарихынан қалпына келтірілген, тірі тізім емес.",
				}),
				userIdLabel: t({
					ru: "ID пользователя",
					en: "User ID",
					kk: "Пайдаланушы ID",
				}),
				userIdPlaceholder: t({
					ru: "вставьте id со страницы пользователей",
					en: "paste an id from the users page",
					kk: "пайдаланушылар бетінен id қойыңыз",
				}),
				load: t({ ru: "Показать", en: "Show", kk: "Көрсету" }),
				empty: t({
					ru: "Для этого пользователя динамических действий не найдено",
					en: "No dynamic actions found for this user",
					kk: "Бұл пайдаланушы үшін динамикалық әрекеттер табылмады",
				}),
				lastSeen: t({
					ru: "Последний раз",
					en: "Last seen",
					kk: "Соңғы рет",
				}),
			},
		},
	},
} satisfies Dictionary;

export default goapContent;
