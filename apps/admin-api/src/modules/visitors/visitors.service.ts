/** A free-text reason, trimmed; blank means "none". */
export function cleanReason(reason: string | undefined): string | undefined {
	return reason?.trim() || undefined;
}
