import { timingSafeEqual } from "node:crypto";

export function sha256Hex(value: string): string {
	return new Bun.CryptoHasher("sha256").update(value).digest("hex");
}

/** `<prefix><random bytes as base64url>`, e.g. `sk_…` for channel keys. */
export function randomToken(prefix: string, bytes: number): string {
	const random = crypto.getRandomValues(new Uint8Array(bytes));
	return `${prefix}${Buffer.from(random).toString("base64url")}`;
}

/**
 * IPs are stored hashed (with a secret salt) so blocks can match without
 * the lookup key being a readable IP.
 */
export function hashIp(ip: string, salt: string): string {
	return sha256Hex(`${salt}:${ip}`);
}

/** Compares a secret to its stored sha256 hex without leaking timing. */
export function matchesHash(secret: string, expectedHashHex: string): boolean {
	const given = Buffer.from(sha256Hex(secret));
	const expected = Buffer.from(expectedHashHex);
	return given.length === expected.length && timingSafeEqual(given, expected);
}
