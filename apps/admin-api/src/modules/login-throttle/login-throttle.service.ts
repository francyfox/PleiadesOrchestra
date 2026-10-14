interface Window {
	start: number;
	count: number;
}

/**
 * In-memory fixed-window failure counter. One admin-api process, so no shared
 * store; a restart resets the budgets.
 */
export class FailureLimiter {
	private readonly windows = new Map<string, Window>();

	constructor(
		private readonly max: number,
		private readonly windowMs: number,
		private readonly now: () => number = Date.now,
		private readonly pruneAbove = 10_000,
	) {}

	/** Milliseconds until `key` may try again; 0 when it isn't locked. */
	retryAfterMs(key: string): number {
		const current = this.windows.get(key);
		if (!current) return 0;
		const left = current.start + this.windowMs - this.now();
		if (left <= 0) {
			this.windows.delete(key);
			return 0;
		}
		return current.count >= this.max ? left : 0;
	}

	fail(key: string): void {
		const now = this.now();
		if (this.windows.size >= this.pruneAbove) this.prune(now);
		const current = this.windows.get(key);
		if (!current || now - current.start >= this.windowMs) {
			this.windows.set(key, { start: now, count: 1 });
		} else {
			current.count++;
		}
	}

	reset(key: string): void {
		this.windows.delete(key);
	}

	private prune(now: number): void {
		for (const [key, window] of this.windows) {
			if (now - window.start >= this.windowMs) this.windows.delete(key);
		}
	}
}

export interface LoginLimits {
	/** Wrong passwords per account (email) before it is locked for `windowMinutes`. */
	maxFailuresPerAccount: number;
	/** Wrong passwords per client IP before the IP is locked, whatever accounts it tried. */
	maxFailuresPerIp: number;
	/** Length of the failure window = length of the lockout. */
	windowMinutes: number;
	/** Registration attempts per IP per hour. */
	maxRegistrationsPerIpPerHour: number;
}

export const DEFAULT_LOGIN_LIMITS: LoginLimits = {
	maxFailuresPerAccount: 5,
	maxFailuresPerIp: 20,
	windowMinutes: 15,
	maxRegistrationsPerIpPerHour: 5,
};

export interface LoginThrottle {
	/** Seconds to wait (>0) when the IP or the account is locked; 0 otherwise. */
	loginRetryAfter(ip: string | null, email: string): number;
	loginFailed(ip: string | null, email: string): void;
	loginSucceeded(email: string): void;
	/** Counts a registration attempt; returns seconds to wait (>0) when over budget. */
	registerAttempt(ip: string | null): number;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/**
 * Brute-force protection for the explicit login/register routes (better-auth's
 * own limiter only runs in its HTTP handler, which isn't mounted). Failures are
 * keyed by trusted IP and, separately, by account — the account key also
 * covers unknown emails, so responses don't reveal which accounts exist.
 */
export function createLoginThrottle(
	limits: Partial<LoginLimits> = {},
	now: () => number = Date.now,
): LoginThrottle {
	const l = { ...DEFAULT_LOGIN_LIMITS, ...limits };
	const windowMs = l.windowMinutes * MINUTE;
	const byIp = new FailureLimiter(l.maxFailuresPerIp, windowMs, now);
	const byAccount = new FailureLimiter(l.maxFailuresPerAccount, windowMs, now);
	const registrations = new FailureLimiter(
		l.maxRegistrationsPerIpPerHour,
		HOUR,
		now,
	);
	const ipKey = (ip: string | null) => ip ?? "unknown";
	const accountKey = (email: string) => email.trim().toLowerCase();
	const seconds = (ms: number) => Math.ceil(ms / 1000);

	return {
		loginRetryAfter: (ip, email) =>
			seconds(
				Math.max(
					byIp.retryAfterMs(ipKey(ip)),
					byAccount.retryAfterMs(accountKey(email)),
				),
			),
		loginFailed(ip, email) {
			byIp.fail(ipKey(ip));
			byAccount.fail(accountKey(email));
		},
		loginSucceeded: (email) => byAccount.reset(accountKey(email)),
		registerAttempt(ip) {
			const key = ipKey(ip);
			const wait = registrations.retryAfterMs(key);
			if (wait > 0) return seconds(wait);
			registrations.fail(key);
			return 0;
		},
	};
}
