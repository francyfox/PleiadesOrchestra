// React JSX typing of <pleiades-chat>. Own tsconfig: the widget's own TSX uses a different JSX factory.
import type {} from "../types/react";

export const ok = (
	<pleiades-chat
		agent-url="https://agent.example.com"
		publishable-key="pk_abcdefghijklmnop"
		position="top-left"
		open
	/>
);

export const noKey = (
	// @ts-expect-error the public key is required
	<pleiades-chat agent-url="https://agent.example.com" />
);

export const badPosition = (
	<pleiades-chat
		agent-url="https://agent.example.com"
		publishable-key="pk_abcdefghijklmnop"
		// @ts-expect-error not a corner
		position="middle"
	/>
);
