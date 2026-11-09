import { eq } from "drizzle-orm";
import { createBalanceAlerts } from "../balance-alerts/balance-alerts.service.ts";
import { channelDirectory } from "../channel-directory/channel-directory.instance.ts";
import { config } from "../config/config.service.ts";
import { db } from "../database/database.instance.ts";
import { channels } from "../database/database.schema.ts";
import { balanceNano } from "../ledger/ledger.service.ts";
import { priceBook } from "../prices/prices.instance.ts";
import { runs } from "../run-binding/run-binding.instance.ts";
import { notifier } from "../webhooks/webhooks.instance.ts";
import { SqliteUsageRecorder } from "./usage-recorder.ts";

const balanceAlerts = createBalanceAlerts({
	balanceOf: (accountId) => balanceNano(db, accountId),
	channelsOf: (accountId) =>
		db
			.select({ id: channels.id })
			.from(channels)
			.where(eq(channels.ownerId, accountId))
			.all()
			.map((row) => row.id),
	emit: notifier.emit,
	lowThresholdTr: config.BALANCE_LOW_THRESHOLD_TR,
});

export const usageRecorder = new SqliteUsageRecorder(db, runs, {
	// get() refreshes the daily list in the background; the debit uses what is cached now.
	prices: () => {
		void priceBook.get();
		return priceBook.peek();
	},
	log: (message) => console.error(message),
	onDebited: (accountId) => {
		// The next request sees the new balance; the call that crossed 0 has finished.
		channelDirectory.refreshStanding(accountId);
		balanceAlerts.check(accountId);
	},
});
