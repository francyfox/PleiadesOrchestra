// The playground's demo list and the channel (publishable key) each demo talks to.
// Demos are self-hosted in static/playground-demos (see its README): same-origin, so the
// polyfill reads their tools directly. Labels name how each demo declares tools:
// imperative = registerTool() in JS, declarative = <form toolname>.
export interface Demo {
	/** Env suffix: PUBLIC_PLEIADES_KEY_<ENV> is this demo's own channel key. */
	env: string;
	label: string;
	url: string;
}

export const demos: Demo[] = [
	{
		env: "BASKETFUL",
		label: "Basketful (imperative + declarative)",
		url: "/playground-demos/basketful/index.html",
	},
	{
		env: "PIZZA_MAKER",
		label: "Pizza Maker (imperative)",
		url: "/playground-demos/pizza-maker/index.html",
	},
	{
		env: "EXPLAINER",
		label: "Explainer (imperative)",
		url: "/playground-demos/explainer/index.html",
	},
	{
		env: "FLIGHT_SEARCH",
		label: "Flight Search (imperative)",
		url: "/playground-demos/react-flightsearch/index.html",
	},
	{
		env: "TICKET_BOOKING",
		label: "CineFlow (imperative)",
		url: "/playground-demos/ticket-booking/index.html",
	},
	{
		env: "HOTEL_CHAIN",
		label: "Hotel Chain (imperative + declarative)",
		url: "/playground-demos/hotel-chain/index.html",
	},
];

export interface DemoChannel {
	key: string;
	/** True when the demo has its own key; false = the shared fallback key. */
	own: boolean;
}

/** `PUBLIC_PLEIADES_KEY_<DEMO>` if set, else the shared `PUBLIC_PLEIADES_KEY`. */
export function demoChannel(
	env: Record<string, string | undefined>,
	demo: Demo,
): DemoChannel {
	const own = env[`PUBLIC_PLEIADES_KEY_${demo.env}`]?.trim();
	if (own) return { key: own, own: true };
	return { key: env.PUBLIC_PLEIADES_KEY?.trim() ?? "", own: false };
}
