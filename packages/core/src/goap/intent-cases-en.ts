/**
 * What the translator (Opus-MT ru→en, `apps/alpha-orchestrator`) hands Laya
 * for each Russian case of `intent-cases.ts`: Laya reads English only, and the
 * eval (`bun run eval:intents`) must feed it what production does. The native
 * translator is not available on the eval host, so these are written by hand,
 * faithful to the words (not improved toward the expected intent). A real
 * translator is a little worse than this («купить творог» → "buy some
 * cottage"), so the eval's "Laya alone" figure is an upper bound.
 * Latin words stay as typed, as in `translateAroundLatin`.
 */
const ENGLISH: Record<string, string> = {
	привет: "hello",
	"как дела?": "how are you?",
	"спасибо!": "thank you!",
	"кто ты?": "who are you?",
	"какая сегодня погода?": "what is the weather today?",
	"перейди в магазин Penny Pantry": "go to the store Penny Pantry",
	"хочу покупать в Greenleaf Market": "I want to buy in Greenleaf Market",
	"переключись на другой магазин": "switch to another store",
	"открой корзину": "open the cart",
	"покажи мои заказы": "show my orders",
	"что у меня в корзине?": "what is in my cart?",
	"найди сыр": "find cheese",
	"найди молоко дешевле 5 долларов": "find milk cheaper than 5 dollars",
	"что у вас есть из молочки?": "what do you have from dairy?",
	"есть ли у вас яблоки?": "do you have apples?",
	"только веганские": "only vegan",
	"покажи только безглютеновые": "show only gluten-free",
	"дешевле 3 долларов": "cheaper than 3 dollars",
	"открой первый товар": "open the first product",
	"расскажи подробнее про Brie": "tell me more about Brie",
	"купи 1 сыр": "buy 1 cheese",
	"купи сыр": "buy cheese",
	"добавь молоко в корзину": "add milk to the cart",
	"хочу яблоки": "I want apples",
	"закажи три банана": "order three bananas",
	"добавь самый дешёвый ноутбук в корзину":
		"add the cheapest laptop to the cart",
	"положи в корзину хлеб": "put bread in the cart",
	"добавь ещё одну": "add one more",
	"удали сыр из корзины": "remove cheese from the cart",
	"убери молоко": "remove the milk",
	"не надо хлеб": "no bread needed",
	"очисти корзину": "clear the cart",
	"удали все из корзины": "remove everything from the cart",
	"оформи заказ": "place an order",
	"оплатить заказ": "pay for the order",
	"всё, заказываю": "that's all, I'm ordering",
	"хочу оформить покупку": "I want to complete the purchase",
	"покажи следующие": "show the next ones",
	дальше: "further",
	"сравни Brie и Gouda": "compare Brie and Gouda",
	"что лучше, овсяное или миндальное молоко?":
		"which is better, oat or almond milk?",

	// INTENT_HOLDOUT
	"добрый день": "good afternoon",
	"расскажи о себе": "tell me about yourself",
	"сколько будет два плюс два?": "how much is two plus two?",
	"пока!": "bye!",
	"давай в Harbor Foods Co-op": "let's go to Harbor Foods Co-op",
	"заказывать буду в Penny Pantry": "I will order in Penny Pantry",
	"покажи корзину": "show the cart",
	"зайди на страницу с рецептами": "go to the page with recipes",
	"где мои заказы?": "where are my orders?",
	"поищи йогурт": "search for yogurt",
	"есть что-нибудь без лактозы?": "is there anything lactose-free?",
	"какие у вас есть сыры?": "what cheeses do you have?",
	"найди мне рис": "find me rice",
	"только дешёвые": "only cheap ones",
	"без сахара": "without sugar",
	"покажи подробности про первый вариант":
		"show details about the first option",
	"открой второй": "open the second one",
	"купи две бутылки молока": "buy two bottles of milk",
	"мне нужен хлеб": "I need bread",
	"закинь в корзину яйца": "throw eggs in the cart",
	"бери три банана": "take three bananas",
	"купить творог": "buy cottage cheese",
	"выкинь яйца из корзины": "throw the eggs out of the cart",
	"передумал, хлеб не нужен": "changed my mind, I don't need bread",
	"давай оплатим": "let's pay",
	оформляем: "we are placing the order",
	"заканчиваю покупки, к оплате": "I'm finishing shopping, to payment",
	"покажи ещё": "show more",
	"предыдущая страница": "previous page",
	"в чём разница между двумя маслами?":
		"what is the difference between the two oils?",
	"сравни эти два йогурта": "compare these two yogurts",
};

/** The English text for a Russian eval case, or `undefined` for a message that is English already. */
export function englishOf(message: string): string | undefined {
	return ENGLISH[message];
}
