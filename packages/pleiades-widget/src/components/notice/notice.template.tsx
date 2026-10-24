import { h, render } from "@/jsx/jsx.ts";

/** The question about unfinished work, above the composer; hidden while there is none. */
export const noticeTemplate = (scope: string) =>
	render(
		<div class="notice" part="notice" x-data={scope} x-show="visible">
			<span role="status" x-text="text" />
			<span class="notice-actions">
				<button
					type="button"
					x-show="asking"
					x-on:click="doContinue"
					x-text="continueLabel"
				/>
				<button
					type="button"
					x-show="asking"
					x-on:click="doCancel"
					x-text="cancelLabel"
				/>
				<button
					type="button"
					x-show="canRetry"
					x-on:click="doRetry"
					x-text="retryLabel"
				/>
			</span>
		</div>,
	);
