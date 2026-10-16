declare global {
	/** PUBLIC_* env vars inlined by vite.config.ts (playground channel keys). */
	const __PUBLIC_ENV__: Record<string, string | undefined>;
}

export {};
