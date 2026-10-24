import type { ChatProgress } from "@/lib/chat/chat.ts";
import type { Strings } from "@/lib/i18n/i18n.ts";

export function elapsedText(ms: number): string {
	const total = Math.max(0, Math.floor(ms / 1000));
	return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** The bar for a message of several tasks: «Done 1 of 3 · 0:07», the running task, a thin line. */
export function createProgressModel(s: Strings) {
	let progress: ChatProgress | undefined;
	return {
		visible: false,
		/** The clock is running: the widget keeps one interval alive while this is true. */
		running: false,
		label: "",
		elapsed: "",
		current: "",
		fill: "",
		/** What the live region says: changes with done/total only, never with the clock. */
		announce: "",
		render(next: ChatProgress | undefined, now: number) {
			progress = next;
			this.visible = next !== undefined;
			if (!next) {
				this.running = false;
				return;
			}
			this.running = next.endedAt === undefined;
			this.label = s.progress
				.replace("{done}", String(next.done))
				.replace("{total}", String(next.total));
			this.announce = this.label;
			this.current = next.current;
			this.fill = `width:${Math.round((next.done / next.total) * 100)}%`;
			this.tick(now);
		},
		tick(now: number) {
			if (!progress) return;
			this.elapsed = elapsedText(
				(progress.endedAt ?? now) - progress.startedAt,
			);
		},
	};
}
