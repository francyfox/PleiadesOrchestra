import { tzOffset } from "@date-fns/tz";
import Fuse from "fuse.js";
import { writable } from "svelte/store";

/** The signed-in account's IANA zone; every date the panel shows is rendered in it. null (signed out) = the browser's. */
export const timeZone = writable<string | null>(null);

/** The browser's zone, to prefill the pickers. */
export const browserTimeZone = () =>
	Intl.DateTimeFormat().resolvedOptions().timeZone;

/** "UTC+5", "UTC+5:30", "UTC-3": the zone's offset on `at`, so a daylight-saving zone shows what is in effect. */
export function utcOffsetLabel(zone: string, at: Date = new Date()): string {
	const minutes = tzOffset(zone, at);
	const abs = Math.abs(minutes);
	const rest = abs % 60;
	return `UTC${minutes < 0 ? "-" : "+"}${Math.floor(abs / 60)}${rest ? `:${String(rest).padStart(2, "0")}` : ""}`;
}

/** IANA zone names the browser knows (it omits "UTC"), labelled with the offset in effect on `at`. */
export const zoneOptions = (at: Date = new Date()) =>
	["UTC", ...Intl.supportedValuesOf("timeZone")].map((zone) => ({
		value: zone,
		label: `${utcOffsetLabel(zone, at)} · ${zone}`,
	}));

/** What the picker's search reads as an offset: "5", "+5", "utc-3", "5:30" (sign optional). */
const OFFSET_QUERY = /^(?:utc)?([+-])?(\d{1,2}(?::\d{0,2})?)$/i;

/**
 * Search over the labels. A number is matched exactly on the offset ("5" finds +5 and +5:30, never +1: a fuzzy
 * match would call that one typo); anything else is fuzzy on the name ("almty"). An empty query keeps the order.
 */
export function createZoneSearch<T extends { label: string }>(options: T[]) {
	const fuse = new Fuse(options, {
		keys: ["label"],
		threshold: 0.3,
		ignoreLocation: true,
	});
	return (query: string) => {
		const offset = OFFSET_QUERY.exec(query.trim());
		if (offset)
			return options.filter(({ label }) => {
				const shown = label.split(" ")[0].slice(3); // "UTC+5:30" -> "+5:30"
				return (
					(!offset[1] || offset[1] === shown[0]) &&
					shown.slice(1).startsWith(offset[2])
				);
			});
		return query ? fuse.search(query).map((hit) => hit.item) : options;
	};
}
