/** Build-time env of the docs site used by the mocked playground tests (see playwright.config.ts). */
export const AGENT_URL = "http://localhost:3000";
export const SHARED_KEY = "pk_e2e_shared";
/** Demos that get their own channel; every other demo shares SHARED_KEY. */
export const OWN_KEYS = {
	PIZZA_MAKER: "pk_e2e_pizza",
	HOTEL_CHAIN: "pk_e2e_hotel",
} as const;

export const DOCS_TEST_ENV = [
	`PUBLIC_PLEIADES_AGENT_URL=${AGENT_URL}`,
	`PUBLIC_PLEIADES_KEY=${SHARED_KEY}`,
	...Object.entries(OWN_KEYS).map(
		([demo, key]) => `PUBLIC_PLEIADES_KEY_${demo}=${key}`,
	),
].join(" ");
