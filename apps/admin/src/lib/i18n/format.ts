/**
 * Locale-bound formatters. Units and separators come from Intl itself, so
 * ru/en/kk need no hand-written strings here; only the "no data" filler is
 * passed in by callers from their dictionaries.
 */
export function createFormat(locale: string) {
	const integer = new Intl.NumberFormat(locale);
	const dateTime = new Intl.DateTimeFormat(locale, {
		dateStyle: "short",
		timeStyle: "short",
	});
	const unit = (u: "millisecond" | "second", digits: number) =>
		new Intl.NumberFormat(locale, {
			style: "unit",
			unit: u,
			unitDisplay: "short",
			maximumFractionDigits: digits,
			minimumFractionDigits: digits,
		});
	const millis = unit("millisecond", 0);
	const GiB = 1024 ** 3;
	const gigabytes = new Intl.NumberFormat(locale, {
		style: "unit",
		unit: "gigabyte",
		unitDisplay: "short",
		maximumFractionDigits: 1,
		minimumFractionDigits: 1,
	});
	const oneDecimal = new Intl.NumberFormat(locale, {
		maximumFractionDigits: 1,
		minimumFractionDigits: 1,
	});
	const seconds = unit("second", 1);

	return {
		locale,
		number: (value: number | null | undefined, missing = "—") =>
			value === null || value === undefined ? missing : integer.format(value),
		date: (ms: number | null | undefined) => (ms ? dateTime.format(ms) : "—"),
		/** Bytes as GB (binary GiB, labelled the way people say it). */
		gb: (bytes: number | null | undefined) =>
			bytes === null || bytes === undefined
				? "—"
				: gigabytes.format(bytes / GiB),
		/** "17.3 / 30.8 GB" — one unit for the pair. */
		gbPair: (used: number | null, total: number | null) => {
			if (used === null || total === null) return "—";
			const unitPart = gigabytes
				.formatToParts(total / GiB)
				.filter((p) => p.type === "unit" || p.type === "literal")
				.map((p) => p.value)
				.join("");
			return `${oneDecimal.format(used / GiB)} / ${oneDecimal.format(total / GiB)}${unitPart}`;
		},
		ms: (value: number | null | undefined) => {
			if (value === null || value === undefined) return "—";
			return value < 1000
				? millis.format(Math.round(value))
				: seconds.format(value / 1000);
		},
	};
}

export type Format = ReturnType<typeof createFormat>;
