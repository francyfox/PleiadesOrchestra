---
title: Playground brief
---

# Playground brief

The original brief for the playground at https://pleiades.shalotts.site/playground/ (`apps/docs`; earlier it lived at /landing/pleiades-orchestra/playground in the shalotts repo).

Build an SPA playground with 4 tiled windows.

Over the iframe, an absolutely positioned select picks the demo:

- https://shopping-webmcp-demo.netlify.app
- https://googlechromelabs.github.io/webmcp-tools/demos/explainer/
- https://googlechromelabs.github.io/webmcp-tools/demos/react-flightsearch
- https://googlechromelabs.github.io/webmcp-tools/demos/pizza-maker/
- https://googlechromelabs.github.io/webmcp-tools/demos/ticket-booking
- https://googlechromelabs.github.io/webmcp-tools/demos/hotel-chain

Windows:

- the largest window is the iframe (test demos with WebMCP/MCP open here);
- the Pleiades side panel (the widget, open from the start and cannot be closed);
- a bottom panel made of two windows:
  - the list of MCP tools as an accordion (the panel content is the tool's description), with a chip on the side for its access (read/write, r/w);
  - the decision graph (canvas graph only), showing only the decision currently running for the user in the playground.

For the widget to work everywhere, add the polyfill (download and include it): https://github.com/GoogleChromeLabs/webmcp-tools/blob/main/demos/shared/webmcp-polyfill.js. The iframe gets `allow="tools"`, and execution is forwarded to the Pleiades widget.
