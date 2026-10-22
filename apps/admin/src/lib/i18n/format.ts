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
	const percent = new Intl.NumberFormat(locale, {
		style: "percent",
		maximumFractionDigits: 1,
	});
	const SUFFIXES = ["", "K", "M", "B", "T"];
	const scaled = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
	// Token spend is often a fraction of a cent: show up to 4 decimals.
	const dollars = new Intl.NumberFormat(locale, {
		style: "currency",
		currency: "USD",
		minimumFractionDigits: 2,
		maximumFractionDigits: 4,
	});

	const tr = new Intl.NumberFormat(locale, {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	});
	/** Order amounts arrive in cents with the currency code of the order. */
	const money = (cents: number, currency: string) =>
		new Intl.NumberFormat(locale, { style: "currency", currency }).format(
			cents / 100,
		);

	return {
		locale,
		/** Trenni balance: "12.34 TR" (1 TR = 1 USD); negative = overdraft. */
		tr: (value: number) => `${tr.format(value)} TR`,
		money,
		number: (value: number | null | undefined, missing = "—") =>
			value === null || value === undefined ? missing : integer.format(value),
		/** A probability 0..1 as "93.5%". */
		percent: (value: number | null | undefined) =>
			value === null || value === undefined ? "—" : percent.format(value),
		/** 1.9K / 12.3M / 2.5B: one decimal, always rounded down; the exact value goes in a tooltip. */
		compact: (value: number | null | undefined, missing = "—") => {
			if (value === null || value === undefined) return missing;
			const abs = Math.abs(value);
			let step = 0;
			while (abs >= 1000 ** (step + 1) && step < SUFFIXES.length - 1) step++;
			if (step === 0) return integer.format(value);
			// Whole tenths of the unit by integer division: scaling by 1000 first loses the last digit (4.35 * 10).
			const down = Math.floor(abs / 10 ** (3 * step - 1)) / 10;
			return `${value < 0 ? "-" : ""}${scaled.format(down)}${SUFFIXES[step]}`;
		},
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
		usd: (value: number | null | undefined) =>
			value === null || value === undefined ? "—" : dollars.format(value),
		ms: (value: number | null | undefined) => {
			if (value === null || value === undefined) return "—";
			return value < 1000
				? millis.format(Math.round(value))
				: seconds.format(value / 1000);
		},
	};
}

export type Format = ReturnType<typeof createFormat>;
