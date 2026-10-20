import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** 32 random bytes = 43 base64url characters; longer tokens are tolerated, shorter ones never valid. */
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43,128}$/;

export const generateToken = () => randomBytes(32).toString("base64url");

export const hashToken = (token: string) =>
	createHash("sha256").update(token).digest("hex");

export const isTokenShape = (token: string) => TOKEN_SHAPE.test(token);

/** Constant-time comparison of a presented token with a stored SHA-256 hex. */
export function tokenMatches(token: string, storedHash: string | null) {
	if (!storedHash || !isTokenShape(token)) return false;
	const a = Buffer.from(hashToken(token));
	const b = Buffer.from(storedHash);
	return a.length === b.length && timingSafeEqual(a, b);
}
