import { createConnectionMonitor, type Problem } from "./connection-monitor";

type Listener = (problem: Problem, active: boolean) => void;

const listeners = new Set<Listener>();

const monitor = createConnectionMonitor({
	onChange: (problem, active) => {
		for (const listener of [...listeners]) listener(problem, active);
	},
});

/** Sources call this with their own name; `down` is the raw state, the monitor decides what is worth announcing. */
export const reportConnection = monitor.report;

/** Announcements: `active: true` once a problem has lasted a while, `false` when it is over. */
export function onConnectionChange(listener: Listener): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}
