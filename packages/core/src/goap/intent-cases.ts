import type { MessageIntent } from "./message-intent";

/**
 * Messages a shopper really types, with the intent each one must be sorted
 * into — the yardstick for `classifyMessageIntent` (live run:
 * `bun run eval:intents`, needs gamma-decision). Russian and English, because
 * the 1B classifier is far from equally good in both. Add a case for every
 * misclassification found in a real trace.
 */
export interface IntentCase {
	message: string;
	expected: MessageIntent;
}

const cases = (expected: MessageIntent, ...messages: string[]): IntentCase[] =>
	messages.map((message) => ({ message, expected }));

export const INTENT_CASES: IntentCase[] = [
	...cases(
		"chat",
		"привет",
		"как дела?",
		"спасибо!",
		"кто ты?",
		"hello",
		"what can you do?",
		"thanks a lot",
		"какая сегодня погода?",
	),
	...cases(
		"chooseStore",
		"перейди в магазин Penny Pantry",
		"хочу покупать в Greenleaf Market",
		"переключись на другой магазин",
		"go to the Greenleaf market",
		"switch to Harbor Foods",
	),
	...cases(
		"navigate",
		"открой корзину",
		"покажи мои заказы",
		"что у меня в корзине?",
		"open the cart",
		"show my orders",
		"go to the recipes page",
	),
	...cases(
		"search",
		"найди сыр",
		"найди молоко дешевле 5 долларов",
		"что у вас есть из молочки?",
		"есть ли у вас яблоки?",
		"find cheese",
		"do you have oat milk?",
		"show me bread",
	),
	...cases(
		"filter",
		"только веганские",
		"покажи только безглютеновые",
		"дешевле 3 долларов",
		"only organic",
	),
	...cases(
		"select",
		"открой первый товар",
		"расскажи подробнее про Brie",
		"open the first one",
	),
	...cases(
		"addToCart",
		"купи 1 сыр",
		"купи сыр",
		"добавь молоко в корзину",
		"хочу яблоки",
		"закажи три банана",
		"добавь самый дешёвый ноутбук в корзину",
		"положи в корзину хлеб",
		"добавь ещё одну",
		"buy 1 cheese",
		"add milk to my cart",
		"I want two loaves of bread",
		"order some apples",
	),
	...cases(
		"removeFromCart",
		"удали сыр из корзины",
		"убери молоко",
		"не надо хлеб",
		"remove the cheese from my cart",
		"take out the apples",
	),
	...cases(
		"checkout",
		"оформи заказ",
		"оплатить заказ",
		"всё, заказываю",
		"хочу оформить покупку",
		"checkout",
		"place my order",
		"I'm done, pay now",
	),
	...cases("paginate", "покажи следующие", "дальше", "show more results"),
	...cases(
		"compare",
		"сравни Brie и Gouda",
		"что лучше, овсяное или миндальное молоко?",
		"compare these two cheeses",
	),
];

/**
 * A second set, written BEFORE the lexical rules of `message-cues.ts` and never
 * used to shape them: if the rules score well here too, they generalize and
 * aren't just the first set restated. Don't tune rules against it — add new
 * real-world misses to `INTENT_CASES` instead.
 */
export const INTENT_HOLDOUT: IntentCase[] = [
	...cases(
		"chat",
		"добрый день",
		"расскажи о себе",
		"good morning",
		"you're great",
		"сколько будет два плюс два?",
		"пока!",
	),
	...cases(
		"chooseStore",
		"давай в Harbor Foods Co-op",
		"заказывать буду в Penny Pantry",
		"let's shop at Penny Pantry",
		"change the store please",
	),
	...cases(
		"navigate",
		"покажи корзину",
		"зайди на страницу с рецептами",
		"где мои заказы?",
		"take me to the cart",
		"show the recipes",
	),
	...cases(
		"search",
		"поищи йогурт",
		"есть что-нибудь без лактозы?",
		"какие у вас есть сыры?",
		"look for bananas",
		"what kinds of tea do you sell?",
		"найди мне рис",
	),
	...cases(
		"filter",
		"только дешёвые",
		"без сахара",
		"under 4 dollars only",
		"just the gluten free ones",
	),
	...cases(
		"select",
		"покажи подробности про первый вариант",
		"открой второй",
		"tell me more about the second one",
	),
	...cases(
		"addToCart",
		"купи две бутылки молока",
		"мне нужен хлеб",
		"закинь в корзину яйца",
		"бери три банана",
		"get me a dozen eggs",
		"put bread in the basket",
		"I'd like to buy some rice",
		"купить творог",
	),
	...cases(
		"removeFromCart",
		"выкинь яйца из корзины",
		"передумал, хлеб не нужен",
		"delete the milk from my cart",
		"I don't want the rice anymore",
	),
	...cases(
		"checkout",
		"давай оплатим",
		"оформляем",
		"заканчиваю покупки, к оплате",
		"let's pay for this",
		"complete my purchase",
	),
	...cases("paginate", "покажи ещё", "предыдущая страница", "next page"),
	...cases(
		"compare",
		"в чём разница между двумя маслами?",
		"сравни эти два йогурта",
		"which one is better, brie or camembert?",
	),
];
