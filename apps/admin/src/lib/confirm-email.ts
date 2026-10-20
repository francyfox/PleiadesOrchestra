/** Typed confirmation for deleting an account: trimmed and case-insensitive, same rule as admin-api's `confirm_mismatch`. */
export const confirmEmailMatches = (typed: string, email: string) =>
	typed.trim().toLowerCase() === email.trim().toLowerCase() && email !== "";
