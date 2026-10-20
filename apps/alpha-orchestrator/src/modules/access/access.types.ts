export type VisitorStatus = "allowed" | "pending" | "blocked";

export interface AccessChannel {
	accessMode: "whitelist" | "open";
	disabledAt: number | null;
}

export interface AccessVisitor {
	blockedAt: number | null;
	whitelistedAt: number | null;
}
