import { Composer } from "gramio";
import { config } from "../env.ts";
import { composer } from "../plugins/index.ts";

export const startComposer = new Composer()
	.extend(composer)
	.command("start", (context) => {
		if (
			!context.from ||
			!config.ALLOWED_TELEGRAM_USER_IDS.includes(context.from.id)
		)
			return;
		return context.send("Привет! Пиши что угодно.");
	});
