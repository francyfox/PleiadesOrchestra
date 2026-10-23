---
name: pleiades-site-assistant
description: Use when the user wants facts, a lookup, a comparison or a purchase on a website that is connected to PleiadesOrchestra (a WordPress/WooCommerce shop with the widget), or before you start browsing such a site with browser tools. Not for login, payment or sites that are not connected.
---

# Pleiades site assistant (experimental)

You plan; the site's small models decide and speak. Stopgap until the orchestrator's own planner matches a large model.

| Who | Does |
|---|---|
| You (large model) | split the task into steps, call the site's tools in the browser (WebMCP), keep the order of steps |
| `pleiades_decide` (Laya) | **every choice between candidates**: which product, variant, tool. Never pick one yourself |
| `pleiades_site_task` (small models) | a one-question lookup or the customer-facing wording, read-only |

1. Call `pleiades_list_sites` once per session. If the target site is not listed, don't call any other `pleiades_*` tool: use the browser.
2. Plan the steps yourself (search, pick, add, confirm). Run each step with the site's own tools in the browser.
3. When a step leaves two or more candidates (search results, variants, recipes), call `pleiades_decide` with `question` = the user's need in one sentence and `options` = `{ key: "name, price, key traits" }` (keys short, descriptions one line). Use its `choice`. If `probability` is under about 0.6, ask the user instead of guessing.
4. For a plain fact or a short answer, `pleiades_site_task` with the user's own words, one question per call. `done`: say the answer came from the site's assistant and is unverified. `not_applicable`, or `failed` twice: go on in the browser.
5. Cart changes are made by you in the browser, one tool call per item; never through `pleiades_site_task`. Never send credentials or payment data through any `pleiades_*` tool, and never press checkout without the user's explicit word.
