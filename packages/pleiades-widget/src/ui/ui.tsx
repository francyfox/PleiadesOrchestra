import type { ChatState } from "../lib/chat";
import type { Position } from "../lib/config";
import { h } from "./jsx";
import { Launcher } from "./launcher";
import { Panel, type PanelOptions } from "./panel";

export interface UiOptions extends Omit<PanelOptions, "onClose"> {
	position: Position;
	onToggle: () => void;
	onClose: () => void;
}

/** The whole widget, in the shadow root: launcher button + side panel on the same side. */
export function createUi({
	position,
	onToggle,
	onClose,
	...panelOptions
}: UiOptions) {
	const launcher = Launcher({ s: panelOptions.s, onToggle });
	const panel = Panel({
		...panelOptions,
		onClose: () => {
			onClose();
			launcher.el.focus();
		},
	});
	const el = (
		<div class="widget" data-pos={position}>
			{launcher.el}
			{panel.el}
		</div>
	) as HTMLDivElement;

	return {
		el,
		render: (state: ChatState) => panel.render(state),
		setOpen(open: boolean) {
			el.classList.toggle("open", open);
			launcher.setOpen(open);
			panel.setOpen(open);
		},
	};
}

export type Ui = ReturnType<typeof createUi>;
