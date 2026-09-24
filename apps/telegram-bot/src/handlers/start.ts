import { Composer } from "gramio";
import { isUserAllowed } from "../access.ts";
import { harnessClient } from "../harness.ts";
import { composer } from "../plugins/index.ts";

export const startComposer = new Composer()
	.extend(composer)
	.command("start", async (context) => {
		if (!context.from) return;
		// Silent for anyone not allowed — also registers the user with the
		// orchestrator, so they show up in the admin panel's whitelist queue.
		const allowed = await isUserAllowed(harnessClient, context.from, (error) =>
			console.error("Access check failed:", error),
		);
		if (!allowed) return;
		return context.send("Привет! Пиши что угодно.");
	});
