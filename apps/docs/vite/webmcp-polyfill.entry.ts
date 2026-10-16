// The demos' document.modelContext: the polyfill the widget ships, built into
// static/playground-demos/shared/ (`bun run polyfill`), so the playground and
// its e2e exercise our code, not Google's original.
import { installWebMcpPolyfill } from "@repo/webmcp-polyfill";

installWebMcpPolyfill();
