export interface StatusProgress {
	chunkIndex: number;
	totalChunks: number;
	elapsedMs: number;
	contextChars: number;
}

const ANIMATION_FRAMES = [".", "..", "..."];

function animationFrame(tick: number): string {
	const index = Math.abs(tick) % ANIMATION_FRAMES.length;
	return ANIMATION_FRAMES[index] ?? ".";
}

export function renderStatusText(
	tick: number,
	progress: StatusProgress | null,
): string {
	const frame = animationFrame(tick);
	if (!progress) return `Думаю${frame}`;

	const seconds = (progress.elapsedMs / 1000).toFixed(1);
	return (
		`Думаю${frame}\n` +
		`Часть ${progress.chunkIndex + 1}/${progress.totalChunks} · ${seconds}с · ${progress.contextChars} симв. контекста`
	);
}
