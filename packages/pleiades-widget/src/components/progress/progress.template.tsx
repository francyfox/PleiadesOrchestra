import { h, render } from "@/jsx/jsx.ts";

/** Progress of a message of several tasks, above the composer. The live region speaks done/total only; the ticking time is hidden from it. */
export const progressTemplate = (scope: string) =>
	render(
		<div class="progress" part="progress" x-data={scope} x-show="visible">
			<span class="sr" role="status" aria-live="polite" x-text="announce" />
			<div aria-hidden="true">
				<div class="progress-head">
					<span x-text="label" />
					<span x-text="elapsed" />
				</div>
				<div class="progress-task" x-text="current" />
				<div class="progress-track">
					<i x-bind:style="fill" />
				</div>
			</div>
		</div>,
	);
