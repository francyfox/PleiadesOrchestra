// Typed `<pleiades-chat>` in React JSX (React types 18.3+ / 19).
// Use once, anywhere in the project:  import type {} from "pleiades-widget/react";
import type { DetailedHTMLProps, HTMLAttributes } from "react";
import type { PleiadesChatAttributes, PleiadesChatElement } from "./index";

declare module "react" {
	namespace JSX {
		interface IntrinsicElements {
			"pleiades-chat": DetailedHTMLProps<
				HTMLAttributes<PleiadesChatElement>,
				PleiadesChatElement
			> &
				PleiadesChatAttributes;
		}
	}
}
