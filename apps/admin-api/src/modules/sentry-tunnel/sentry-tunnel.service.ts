/**
 * Where an envelope from the browser goes: its header line (the first one)
 * names the DSN; only our own DSN is forwarded, so the tunnel can't be used
 * to send data to any other Sentry project.
 */
export function tunnelTarget(
	envelope: string,
	allowedDsn: string,
): string | null {
	try {
		const header = JSON.parse(envelope.slice(0, envelope.indexOf("\n")));
		const dsn = new URL(String(header.dsn));
		const allowed = new URL(allowedDsn);
		if (
			dsn.host !== allowed.host ||
			dsn.username !== allowed.username ||
			dsn.pathname !== allowed.pathname
		) {
			return null;
		}
		return `https://${allowed.host}/api${allowed.pathname}/envelope/`;
	} catch {
		return null;
	}
}
