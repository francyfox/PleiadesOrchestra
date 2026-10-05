export interface PanelOptions {
	heading: string;
	onClose: () => void;
}

export function createPanelModel({ heading, onClose }: PanelOptions) {
	return {
		heading,
		onEscape() {
			onClose();
		},
	};
}
