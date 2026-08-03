import { telemetry, withTimeout } from "@repo/core";
import { Composer } from "gramio";
import { agent } from "../agent.ts";
import { config } from "../env.ts";
import { composer } from "../plugins/index.ts";

const LLM_TIMEOUT_MS = 45_000;

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

		const threadId = String(context.chat.id);
		const userId = String(context.from.id);
		const startedAt = Date.now();

		// Never let a handler error/rethrow escape this block: an uncaught
		// rejection here has previously wedged GramIO's polling loop, so the
		// bot stops receiving *any* further messages until manually restarted.
		try {
			const reply = await withTimeout(
				agent.handleMessage({ threadId, userId, text: context.text }),
				LLM_TIMEOUT_MS,
				"LLM request timed out",
			);

			telemetry.logMessageEvent({
				threadId,
				userId,
				username: context.from.username,
				messageLength: context.text.length,
				latencyMs: Date.now() - startedAt,
				ok: true,
			});

			await context.send(reply.text);
		} catch (error) {
			console.error("Failed to handle message:", error);
			telemetry.logMessageEvent({
				threadId,
				userId,
				username: context.from.username,
				messageLength: context.text.length,
				latencyMs: Date.now() - startedAt,
				ok: false,
			});

			await context
				.send("Извините, что-то пошло не так. Попробуйте ещё раз.")
				.catch(() => {});
		}
	});
