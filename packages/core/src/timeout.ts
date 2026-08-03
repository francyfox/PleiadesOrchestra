export function withTimeout<T>(
	promise: Promise<T>,
	timeoutMs: number,
	message = "Operation timed out",
): Promise<T> {
	return Promise.race([
		promise,
		new Promise<never>((_, reject) => {
			setTimeout(() => reject(new Error(message)), timeoutMs);
		}),
	]);
}
