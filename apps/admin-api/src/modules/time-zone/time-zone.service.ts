/** An IANA zone name ("Asia/Almaty", "UTC"); offsets like "+03:00" are refused. */
export function isTimeZone(value: string): boolean {
	if (!/^(UTC|[A-Za-z_]+(\/[A-Za-z0-9_+-]+)+)$/.test(value)) return false;
	try {
		new Intl.DateTimeFormat("en", { timeZone: value });
		return true;
	} catch {
		return false;
	}
}
