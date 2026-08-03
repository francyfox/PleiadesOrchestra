import { telemetry } from "@repo/core";
import { Composer } from "gramio";
import { agent } from "../agent.ts";
import { config } from "../env.ts";
import { composer } from "../plugins/index.ts";

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

		try {
			const reply = await agent.handleMessage({
				threadId,
				userId,
				text: context.text,
			});

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
			telemetry.logMessageEvent({
				threadId,
				userId,
				username: context.from.username,
				messageLength: context.text.length,
				latencyMs: Date.now() - startedAt,
				ok: false,
			});
			throw error;
		}
	});
