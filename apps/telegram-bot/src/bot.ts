import { Bot } from "gramio";
import { config } from "./env.ts";
import { messageComposer } from "./handlers/message.ts";
import { startComposer } from "./handlers/start.ts";
import { composer } from "./plugins/index.ts";

export const bot = new Bot(config.TELEGRAM_TOKEN)
	.extend(composer)
	.extend(startComposer)
	.extend(messageComposer)
	.onStart(({ info }) => console.log(`✨ Bot ${info.username} was started!`));
