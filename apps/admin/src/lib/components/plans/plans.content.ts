import { type Dictionary, t } from "intlayer";

const plansContent = {
	key: "plans",
	content: {
		title: t({ ru: "Тарифы", en: "Plans", kk: "Тарифтер" }),
		subtitle: t({
			ru: "Облачные подписки из Polar. Каждая принадлежит аккаунту; без действующего тарифа каналы владельца приостанавливаются.",
			en: "Cloud subscriptions from Polar. Each belongs to an account; without a plan in effect the owner's channels are paused.",
			kk: "Polar-дағы бұлттық жазылымдар. Әрқайсысы тіркелгіге тиесілі; тариф болмаса иесінің арналары тоқтатылады.",
		}),
		columns: {
			customer: t({ ru: "Клиент", en: "Customer", kk: "Клиент" }),
			plan: t({ ru: "Тариф", en: "Plan", kk: "Тариф" }),
			status: t({ ru: "Статус", en: "Status", kk: "Күйі" }),
			started: t({ ru: "Начался", en: "Started", kk: "Басталды" }),
			expires: t({ ru: "Истекает", en: "Expires", kk: "Аяқталады" }),
			account: t({ ru: "Аккаунт", en: "Account", kk: "Тіркелгі" }),
		},
		status: {
			active: t({ ru: "активен", en: "active", kk: "белсенді" }),
			canceling: t({
				ru: "отменится в конце периода",
				en: "cancels at period end",
				kk: "кезең соңында бас тартылады",
			}),
			past_due: t({
				ru: "просрочен платёж",
				en: "past due",
				kk: "төлем мерзімі өтті",
			}),
			ended: t({ ru: "завершён", en: "ended", kk: "аяқталған" }),
		},
		filters: {
			status: t({ ru: "Статус", en: "Status", kk: "Күйі" }),
			allStatuses: t({
				ru: "Все статусы",
				en: "All statuses",
				kk: "Барлық күйлер",
			}),
			search: t({ ru: "Поиск…", en: "Search…", kk: "Іздеу…" }),
			nothingFound: t({
				ru: "Ничего не найдено",
				en: "Nothing found",
				kk: "Ештеңе табылмады",
			}),
		},
		openInPolar: t({
			ru: "Открыть в Polar",
			en: "Open in Polar",
			kk: "Polar-да ашу",
		}),
		empty: t({
			ru: "Подписок нет",
			en: "No subscriptions",
			kk: "Жазылымдар жоқ",
		}),
	},
} satisfies Dictionary;

export default plansContent;
