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