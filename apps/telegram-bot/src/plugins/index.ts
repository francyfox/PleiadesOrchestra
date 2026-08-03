import { autoAnswerCallbackQuery } from "@gramio/auto-answer-callback-query";
import { autoRetry } from "@gramio/auto-retry";
import { Composer } from "gramio";

export const composer = new Composer({ name: "main" })
	.extend(autoAnswerCallbackQuery())
	.extend(autoRetry())
	.as("scoped");

export type BotType = typeof composer;
