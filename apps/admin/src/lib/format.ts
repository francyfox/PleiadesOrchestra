import type { UsageTotals, UserStatus } from "./api-types";

const dateTime = new Intl.DateTimeFormat("ru-RU", {
	dateStyle: "short",
	timeStyle: "short",
});
const integer = new Intl.NumberFormat("ru-RU");

export function formatDate(ms: number | null | undefined): string {
	return ms ? dateTime.format(ms) : "—";
}

export function formatNumber(value: number | null | undefined): string {
	return value === null || value === undefined
		? "нет данных"
		: integer.format(value);
}

export function formatMs(ms: number | null | undefined): string {
	if (ms === null || ms === undefined) return "—";
	return ms < 1000 ? `${Math.round(ms)} мс` : `${(ms / 1000).toFixed(1)} с`;
}

export function totalTokens(usage: UsageTotals): number {
	return usage.inputTokens + usage.outputTokens;
}

export const STATUS_LABELS: Record<UserStatus, string> = {
	allowed: "допущен",
	pending: "ждёт белого списка",
	blocked: "заблокирован",
};

export function formatValue(value: unknown): string {
	if (value === undefined) return "—";
	return typeof value === "string" ? JSON.stringify(value) : String(value);
}
