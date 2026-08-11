import { telemetry, withTimeout } from "@repo/core";
import { Composer } from "gramio";
import { createThrottleTransfer } from "transferum";
import { config } from "../env.ts";
import { harnessClient } from "../harness.ts";
import { composer } from "../plugins/index.ts";
import { renderStatusText, type StatusProgress } from "../status-message.ts";

const HARNESS_STREAM_TIMEOUT_MS = 120_000;
const THROTTLE_INTERVAL_MS = 1000;
const ANIMATION_INTERVAL_MS = 500;
const NO_ANSWER_TEXT = "Модель не вернула ответ. Попробуйте ещё раз.";

export const messageComposer = new Composer()
	.extend(composer)
	.on("message", async (context) => {
		if (!context.text) return;
		if (
			!context.from ||
			!config.ALLOWED_TELEGRAM_USER_IDS.includes(context.from.id)
		) {
			// Not paired/whitelisted — silently ignore, same intent as IronClaw's
			// pairing model but as an explicit allowlist instead of a chat flow.
			return;
		}

		const text = context.text;
		const chatId = context.chat.id;
		const threadId = String(chatId);
		const userId = String(context.from.id);
		const startedAt = Date.now();

		// Talk to messages by numeric id via the raw bot API rather than
		// holding on to MessageContext instances — the answer message doesn't
		// exist yet when streaming starts, so both messages are addressed the
		// same way (id + editMessageText/deleteMessage) once they do.
		const editMessage = (messageId: number, newText: string) =>
			context.bot.api
				.editMessageText({
					chat_id: chatId,
					message_id: messageId,
					text: newText,
				})
				.then(
					() => {},
					() => {},
				);
		const deleteMessage = (messageId: number) =>
			context.bot.api
				.deleteMessage({ chat_id: chatId, message_id: messageId })
				.then(
					() => {},
					() => {},
				);

		const initialStatusText = renderStatusText(0, null);
		const statusMessage = await context.send(initialStatusText);
		const statusMessageId = statusMessage.id;

		// A single promise chain per rendered message, so throttle emissions
		// (which fire on independent timers) can never touch that message
		// concurrently — each render waits for the previous one to land before
		// deciding "send" vs. "edit" (an in-flight send racing a second push
		// would otherwise spawn a duplicate message instead of editing it).
		let statusRenderQueue = Promise.resolve();
		let lastStatusText = initialStatusText;
		const scheduleStatusRender = (renderedText: string) => {
			if (renderedText === lastStatusText) return;
			lastStatusText = renderedText;
			statusRenderQueue = statusRenderQueue.then(() =>
				editMessage(statusMessageId, renderedText),
			);
		};

		let answerMessageId: number | null = null;
		let answerRenderQueue = Promise.resolve();
		let lastAnswerText = "";
		const scheduleAnswerRender = (renderedText: string) => {
			if (renderedText.length === 0 || renderedText === lastAnswerText) return;
			lastAnswerText = renderedText;
			answerRenderQueue = answerRenderQueue.then(async () => {
				try {
					if (answerMessageId !== null) {
						await editMessage(answerMessageId, renderedText);
					} else {
						const sent = await context.send(renderedText);
						answerMessageId = sent.id;
					}
				} catch {
					// Rate limits/transient failures on an intermediate render aren't
					// fatal — the next throttled render (or the final flush) retries.
				}
			});
		};

		let animationTick = 0;
		let latestProgress: StatusProgress | null = null;

		const statusThrottle = createThrottleTransfer<string>({
			interval: THROTTLE_INTERVAL_MS,
		});
		statusThrottle.subscribe(scheduleStatusRender);

		const answerThrottle = createThrottleTransfer<string>({
			interval: THROTTLE_INTERVAL_MS,
		});
		answerThrottle.subscribe(scheduleAnswerRender);

		const animationTimer = setInterval(() => {
			animationTick++;
			statusThrottle.push(renderStatusText(animationTick, latestProgress));
		}, ANIMATION_INTERVAL_MS);

		let answerText = "";

		try {
			await withTimeout(
				(async () => {
					for await (const event of harnessClient.streamMessage({
						threadId,
						userId,
						text,
					})) {
						if (event.type === "progress") {
							latestProgress = event;
							statusThrottle.push(
								renderStatusText(animationTick, latestProgress),
							);
						} else if (event.type === "delta") {
							answerText += event.text;
							answerThrottle.push(answerText);
						}
					}
				})(),
				HARNESS_STREAM_TIMEOUT_MS,
				"Harness stream timed out",
			);

			clearInterval(animationTimer);
			await answerRenderQueue;

			if (answerText.length === 0) {
				await editMessage(statusMessageId, NO_ANSWER_TEXT);
			} else {
				// Final flush guarantees the last delta is shown even if the
				// throttle's trailing edge hadn't fired yet when the stream ended.
				if (answerMessageId !== null) {
					await editMessage(answerMessageId, answerText);
				} else {
					const sent = await context.send(answerText);
					answerMessageId = sent.id;
				}
				await deleteMessage(statusMessageId);
			}

			telemetry.logMessageEvent({
				threadId,
				userId,
				username: context.from.username,
				messageLength: text.length,
				latencyMs: Date.now() - startedAt,
				ok: true,
			});
		} catch (error) {
			clearInterval(animationTimer);
			console.error("Failed to handle message:", error);
			telemetry.logMessageEvent({
				threadId,
				userId,
				username: context.from.username,
				messageLength: text.length,
				latencyMs: Date.now() - startedAt,
				ok: false,
			});

			await editMessage(
				statusMessageId,
				"Извините, что-то пошло не так. Попробуйте ещё раз.",
			);
		} finally {
			statusThrottle.destroy();
			answerThrottle.destroy();
		}
	});
