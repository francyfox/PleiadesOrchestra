/** What can be wrong: the browser's socket to the panel's server, or the data source behind the server. */
export type Problem = "socket" | "upstream";

export interface ConnectionMonitorOptions {
	/** A problem is announced only once it has lasted this long, so a quick reconnect stays silent. */
	delayMs?: number;
	onChange: (problem: Problem, active: boolean) => void;
	setTimer?: (fn: () => void, ms: number) => unknown;
	clearTimer?: (id: unknown) => void;
}

interface State {
	down: Set<string>;
	reported: boolean;
	timer: unknown;
}

const DEFAULT_DELAY_MS = 2000;

/**
 * Turns the raw up/down reports of many sources ("live" socket, "system" socket,
 * one per subscription for the data source) into two calm signals per problem:
 * "this has been wrong for a while" and "it is fine again". It only ever talks
 * about state changes, so a UI can show one persistent notice instead of a burst.
 */
export function createConnectionMonitor(options: ConnectionMonitorOptions) {
	const delay = options.delayMs ?? DEFAULT_DELAY_MS;
	const setTimer =
		options.setTimer ?? ((fn, ms) => setTimeout(fn, ms) as unknown);
	const clearTimer =
		options.clearTimer ??
		((id) => clearTimeout(id as ReturnType<typeof setTimeout>));

	const states: Record<Problem, State> = {
		socket: { down: new Set(), reported: false, timer: null },
		upstream: { down: new Set(), reported: false, timer: null },
	};

	return {
		report(problem: Problem, source: string, down: boolean) {
			const state = states[problem];
			if (down) {
				state.down.add(source);
				if (state.reported || state.timer !== null) return;
				state.timer = setTimer(() => {
					state.timer = null;
					if (state.down.size === 0) return;
					state.reported = true;
					options.onChange(problem, true);
				}, delay);
				return;
			}
			state.down.delete(source);
			if (state.down.size > 0) return;
			if (state.timer !== null) {
				clearTimer(state.timer);
				state.timer = null;
			}
			if (state.reported) {
				state.reported = false;
				options.onChange(problem, false);
			}
		},
	};
}

export type ConnectionMonitor = ReturnType<typeof createConnectionMonitor>;
