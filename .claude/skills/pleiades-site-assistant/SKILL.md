---
name: pleiades-site-assistant
description: Use when the user wants facts, a lookup or a comparison from a website that is connected to PleiadesOrchestra, or before you start browsing such a site with browser tools. Not for login, payment, cart changes or sites that are not connected.
---

# Pleiades site assistant (experimental)

`pleiades_site_task` asks the small-model assistant of a connected website. It is one fast call instead of many browser steps, but it is read-only and has no live site data yet, so its answers are unverified.

1. Call `pleiades_list_sites` once per session and remember the result.
2. If the target site is in that list, try `pleiades_site_task` before the browser. One question per call; pass the user's own words as `task`, don't split it into steps.
3. Handle `status`:
   - `done` — give the answer, say it came from the site's assistant and is unverified; if it matters, confirm in the browser.
   - `not_applicable`, or `failed` twice — switch to the browser tools.
4. If the site is not in the list, don't call it: go straight to the browser.
5. Never send credentials or payment data through it, and never use it to change a cart or account.
