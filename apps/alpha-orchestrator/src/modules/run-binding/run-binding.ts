/**
 * Which GOAP run is currently executing on a thread. The server binds it
 * before `runPlan` and unbinds after, so history writes and usage records
 * made deep inside `@repo/core` get linked to the run even when the core
 * doesn't thread `planRunId` through `CallContext` itself.
 */
export class RunBinding {
	private readonly byThread = new Map<string, string>();

	bind(threadId: string, planRunId: string): void {
		this.byThread.set(threadId, planRunId);
	}

	unbind(threadId: string): void {
		this.byThread.delete(threadId);
	}

	resolve(threadId: string, explicit?: string): string | undefined {
		return explicit ?? this.byThread.get(threadId);
	}
}
