# 0.13.10 - 6 Nov 2026

Feature:
- Admin: every account has a time zone (customers pick it at sign-up, prefilled from the browser, and in `/settings`; staff change an admin's on `/admins`; default UTC for existing accounts, migration `0003_account_time_zone`). The picker shows the UTC offset and searches by it ("5", "+5:30") and by name. All dates in the panel are formatted by date-fns in the viewer's zone.
- Admin: a customer sees spend on the dashboard and in the monthly table of Billing in trenni (TR); staff keep dollars on the dashboard.
- Billing: a customer's balance, the plan and the paused alert update over the WebSocket (new live topic `billing`) instead of once a minute.
- Admin: the channel's allowed origins are site URLs (`https://shop.example.com`, one per line); a value with a path, a trailing slash or no scheme is refused by the form and the API. The channels table fits a desktop: URLs and access mode as chips, the name, plan and key are cut, and every cut table cell shows its full text on hover.

Changed:
- Billing: a request holds 0.001 TR (was 0.05), so a small balance still serves requests.
- Admin: the low-balance banner says channels stop when the balance cannot cover a request, not "at zero"; the delete-account warnings say the subscription ends at once and the balance is lost.

Fixed:
- Billing: a client that cancels the stream no longer frees the request's hold before the run it left behind is debited, so parallel requests cannot overspend the balance through a cancel.

# 0.12.10 - 6 Nov 2026

Feature:
- Billing: a top-up credits its price net of payment fees, payout, tax and conversion, minus a staff margin (`marginPercent`, default 0, previewed in the admin settings). The credited amount is stored per order, so a refund takes back exactly what was granted. Old and non-USD orders keep the face-value behavior.
- Usage: provider prompt-cache hits are recorded and billed at the cache price instead of the full input price.
- Usage: local models get staff-set prices (USD per 1M tokens) on the admin preferences page; an explicit local price wins over OpenRouter's.
- Pricing: public `GET /v1/public/pricing` (open, cacheable) returns what a $5/10/20/50 top-up gives and the price per 1M tokens of the models in use; only "fees and taxes" and "service" are shown, the staff tax setup stays private.
- Landing: the pricing section shows the top-up table and a price list of models in a modal; nothing extra renders if the API is unset or unreachable.
- Admin: the orders table shows credited TR and the fees/taxes/service difference per order.

Changed:
- Usage: a failed model call (`ok = false`) is still recorded but no longer debited, and spend reports skip it to match the ledger.

# 0.11.10 - 4 Nov 2026

Feature:
- Landing: the Cloud plan is open: its button leads to the panel's Billing page (was a disabled "soon").
- Admin: signing in returns to the page asked for. An anonymous visitor of `/billing` (or any page) lands on the customer sign-in with `?redirect=`, and after signing in goes back there; staff pages send to the staff sign-in. Only paths of this site are followed. The redirect survives switching between sign-in and registration.

Changed:
- Admin: access is decided by route guards in the Angular `canActivate` style (`lib/guards.ts`) on route groups `(shared)`, `(customer)`, `(staff)`, `(auth)` instead of one list of paths. URLs are unchanged.
- Admin: an anonymous visitor of `/` now gets the customer sign-in; staff open `/login` directly.
- Admin: every in-app link goes through SvelteKit `resolve()`, so a wrong path is a type error.

# 0.10.10 - 4 Nov 2026

Feature:
- Billing: the balance ledger is kept to the nano-USD (1 TR = 10^9), so a model call loses at most $0.000000001 to rounding (was $0.000001). Existing amounts are migrated (`0028_ledger_nano_usd`).
- Billing: a discounted Polar order tops the balance up by its price before the discount; a 100% code no longer gives a plan with 0 TR. A refund takes back its share.
- Admin: staff can change a user's balance (signed TR, recorded with the admin's id) and grant or end a plan outside Polar, from the user's Billing dialog.
- Admin: `/users` shows each user's balance, sorts by any column and searches by email (state in the URL).
- Admin: balances show 5 decimals with the exact value in a tooltip; the spend chart and the finance tiles show the exact amount on hover; long amounts are cut with an ellipsis.
- Admin: users whose channels are paused for want of balance see a "short on fuel" dialog with a Top up button.

Chore:
- Removed the Cloudflare `tunnel` compose service and its config; public traffic needs your own reverse proxy.

# 0.0.1 - 1 Nov 2026

Feature: 
- Created common Pleiades container for docker. (one line install script)