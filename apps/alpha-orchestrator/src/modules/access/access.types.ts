export type UserStatus = "allowed" | "pending" | "blocked";

export interface AccessChannel {
	accessMode: "whitelist" | "open";
	disabledAt: number | null;
}

export interface AccessUser {
	blockedAt: number | null;
	whitelistedAt: number | null;
}
