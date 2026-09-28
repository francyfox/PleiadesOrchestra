import { PleiadesChat } from "./element";

// Importing (or loading) this file registers <pleiades-chat>; there are no exports on purpose.
if (!customElements.get("pleiades-chat"))
	customElements.define("pleiades-chat", PleiadesChat);
