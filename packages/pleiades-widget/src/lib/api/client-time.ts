const pad = (n: number) => String(n).padStart(2, "0");

/** The visitor's local date and time zone, taken at send time (a tab can stay open past midnight). */
export function clientTime(
	now: Date = new Date(),
	getZone: () => string | undefined = () =>
		Intl.DateTimeFormat().resolvedOptions().timeZone,
) {
	let timeZone: string | undefined;
	try {
		timeZone = getZone();
	} catch {}
	return {
		clientDate: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
		...(timeZone ? { timeZone } : {}),
	};
}
