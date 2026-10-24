import type { ChatNotice } from "@/lib/chat/chat.ts";
import type { Strings } from "@/lib/i18n/i18n.ts";

export interface NoticeOptions {
	s: Strings;
	onContinue: () => void;
	onCancel: () => void;
	onRetry: () => void;
}

/** Unfinished work after a reload or a lost connection: the question for a held tool call (Continue / Cancel), or the lost request (Retry). */
export function createNoticeModel({
	s,
	onContinue,
	onCancel,
	onRetry,
}: NoticeOptions) {
	return {
		visible: false,
		text: "",
		/** Continue / Cancel are shown. */
		asking: false,
		/** Retry is shown (a lost request whose prompt is known). */
		canRetry: false,
		continueLabel: s.continue,
		cancelLabel: s.cancel,
		retryLabel: s.retry,
		render(notice: ChatNotice | undefined) {
			this.visible = notice !== undefined;
			this.asking = notice?.kind === "resume";
			this.canRetry = notice?.kind === "retry" && notice.prompt !== "";
			const head = !notice
				? ""
				: notice.kind === "resume"
					? s.unfinished
					: notice.kind === "cancelled"
						? s.cancelled
						: s.interrupted;
			const left =
				notice && notice.kind !== "cancelled" && notice.tasksLeft > 0
					? ` (${s.tasksLeft.replace("{n}", String(notice.tasksLeft))})`
					: "";
			this.text = head + left;
		},
		doContinue: onContinue,
		doCancel: onCancel,
		doRetry: onRetry,
	};
}
