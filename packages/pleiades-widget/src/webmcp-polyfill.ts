// Separate entry: `import { installWebMcpPolyfill } from "@shalotts/pleiades-widget/webmcp-polyfill"`.
// Importing it registers nothing; the widget's own bundle still installs the polyfill at mount.
export type { WebMcpPolyfillOptions } from "@repo/webmcp-polyfill";
export { installWebMcpPolyfill } from "@repo/webmcp-polyfill";
