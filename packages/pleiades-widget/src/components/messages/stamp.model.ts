import type { Lang } from "@/lib/i18n/i18n.ts";

const MINUTE = 60_000;
const startOfDay = (ts: number) => new Date(new Date(ts).setHours(0, 0, 0, 0));

/**
 * Telegram-style time of a message: «just now», «5 min», the clock time today,
 * «yesterday», then a short date (with the year when it is not this one).
 * `justNow` is the widget's own string; the rest is `Intl` in the widget's language.
 */
export function stampLabel(
	ts: number,
	now: number,
	lang: Lang,
	justNow: string,
): string {
	const age = now - ts;
	if (age < MINUTE) return justNow;
	if (age < 60 * MINUTE)
		return new Intl.NumberFormat(lang, {
			style: "unit",
			unit: "minute",
			unitDisplay: "narrow",
		}).format(Math.floor(age / MINUTE));
	const days = Math.round(
		(startOfDay(now).getTime() - startOfDay(ts).getTime()) / 86_400_000,
	);
	if (days === 0)
		return new Intl.DateTimeFormat(lang, {
			hour: "2-digit",
			minute: "2-digit",
			hourCycle: lang === "en" ? undefined : "h23",
		}).format(ts);
	if (days === 1)
		return new Intl.RelativeTimeFormat(lang, { numeric: "auto" }).format(
			-1,
			"day",
		);
	const sameYear = new Date(ts).getFullYear() === new Date(now).getFullYear();
	return new Intl.DateTimeFormat(lang, {
		day: "numeric",
		month: "short",
		...(sameYear ? {} : { year: "numeric" }),
	}).format(ts);
}

/** The exact local date and time, for the hover title. */
export const stampTitle = (ts: number, lang: Lang): string =>
	new Intl.DateTimeFormat(lang, {
		dateStyle: "medium",
		timeStyle: "short",
	}).format(ts);
