/** Geo / whois / ASN lookup page for an IP address. */
export function whoisUrl(ip: string): string {
	return `https://ipinfo.io/${encodeURIComponent(ip)}`;
}
