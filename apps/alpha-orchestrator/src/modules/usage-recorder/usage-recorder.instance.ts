import { channelDirectory } from "../channel-directory/channel-directory.instance.ts";
import { db } from "../database/database.instance.ts";
import { priceBook } from "../prices/prices.instance.ts";
import { runs } from "../run-binding/run-binding.instance.ts";
import { SqliteUsageRecorder } from "./usage-recorder.ts";

export const usageRecorder = new SqliteUsageRecorder(db, runs, {
	// get() refreshes the daily list in the background; the debit uses what is cached now.
	prices: () => {
		void priceBook.get();
		return priceBook.peek();
	},
	log: (message) => console.error(message),
	// The next request sees the new balance; the call that crossed 0 has finished.
	onDebited: (accountId) => channelDirectory.refreshStanding(accountId),
});
