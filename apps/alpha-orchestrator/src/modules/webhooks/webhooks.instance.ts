import { config } from "../config/config.service.ts";
import { db } from "../database/database.instance.ts";
import { createNotifier } from "./webhooks.service.ts";

export const notifier = createNotifier({
	db,
	allowPrivate: config.WEBHOOKS_ALLOW_PRIVATE,
});
