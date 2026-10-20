---
title: Accounts, roles and billing (plan)
---

# Accounts, roles and billing (plan)

Status: **decided, in progress** (phase 1 done; phase 2 backend done, admin UI follows). Decisions are recorded under "Open questions".

## Goal

One panel, two kinds of accounts:

- **Staff** (super admin, admins) run the instance, as today.
- **Users** (customers) sign up on their own, own channels, buy a plan or credits, and see only their part of the panel.

**Visitors** (people who chat through the widget) are not accounts. They stay in the orchestrator and get readable generated names.

## Roles

| Level | Role | Signs in with | Sees |
|---|---|---|---|
| 0 | super admin | access token | everything; manages admins |
| 100 | admin | access token | everything except managing admins |
| 200 | user | email + password (`/user/login`) | Dashboard (own channels), Channels (own), Billing, Settings, FAQ |

- The level is a number so checks are `level <= 100` ("staff"), and a new role can slot in between later.
- Stored on the admin-api account (`user.level`, integer, not null). The better-auth `admin` plugin's text `role` stays only for ban/session features, or goes away (see questions).
- Visitors have no level: another table in another service.
- **Agents and Models tabs are staff-only.** A user's channels run on the agents the staff picked. There is no per-channel model choice (dropped with PO-15).

## 1. Staff sign-in with a hashed token

- An admin signs in with an **access token** (shown once when the admin is created or the token is rotated; stored as SHA-256, compared in constant time). No password for staff.
- The first super admin: `bun --cwd apps/admin-api run admin:create` prints a token (replaces today's "first register is super").
- **Name and email** of an admin are edited in the panel (Admins page); email is contact data, not a login.
- Rotate token: a button in the panel (own token, or the super for anyone), old token stops at once, sessions of that admin are dropped.
- Sign-in page for staff: `/login` (token field). Users: `/user/login`.

## 2. Users (customers)

- `/user/register` (open), `/user/login`, `/user/forgot` + `/user/reset?token=` (better-auth email+password, `sendResetPassword`).
- Email verification on register (see questions: needs an email transport).
- Panel for level 200: **Dashboard** (own channels' numbers only), **Channels** (own only; create/edit/embed), **Billing**, **Settings**, **FAQ**. No system meter in the header (CPU/RAM/GPU are the host's).
- **Settings**: name, email (re-verify on change), danger zone: delete account (confirm by typing the email). Deleting removes the account, its channels and their visitors' data, and cancels the Polar subscription.
- **Inactivity**: `user.last_active_at` (updated at most once a day on an authenticated request). A daily job deletes users inactive for **180 days**; the Settings page says so. Optional warning email 14 days before (needs email).
- Staff get a new **Users** page: list of level-200 accounts (name, email, plan, balance, last active, channels count), ban/delete.

### Channel ownership

Status: **backend done** (orchestrator `0020_channel_owner`, admin-api scoping, live topics, staff Users routes, own-settings routes). The panel pages are next; the contract is in `admin-api.md` ("Ownership: channels, dashboard, live", "Staff: customers"). Not done yet: cancelling the Polar subscription on account delete (phase 3), the optional warning mail before the inactivity delete.

- `channels.owner_id` (admin-api user id; NULL = staff-owned, today's channels). Different databases, so no FK.
- admin-api scopes every request of a level-200 account: lists filtered by `ownerId`, writes checked against it. The orchestrator trusts admin-api (`ADMIN_API_KEY`) and gets the owner as a query/body field — admin-api is the only place that decides who may see what.
- Live topics (`/api/live`) are scoped the same way (a user's dashboard topic carries its owner id).

## 3. Visitors (today's "Users" page)

- Rename everywhere: orchestrator table `users` → `visitors` (and its columns/FKs), routes `/v1/admin/users*` → `/v1/admin/visitors*`, admin-api `/api/users*` → `/api/visitors*`, panel page `/users` → `/visitors` ("Посетители"). Allowed to drop/recreate tables.
- A visitor has an **id** (unchanged, opaque) and a **name** `adjective_animal_xxxxxx`: two word lists (neutral, English, ~100 each) + a cuid2 of length 6 (`@paralleldrive/cuid2`, `init({ length: 6 })`). Identified visitors keep the site's `displayName` and also get a generated name as fallback.
- Copy-id button next to the name (house `CopyValue`).

## 4. Billing (Polar)

Two products, both paid through Polar checkout:

1. **Monthly plan** (subscription).
2. **Credits — trenni (TR)**: one-time purchases; **1 TR = 1 USD**. Shown with the `TR` sign.

- A checkout is created by admin-api for the signed-in user with Polar's `external_customer_id = user.id`, so every webhook maps to an account (today subscriptions are linked to a channel by hand — that link goes away).
- The orchestrator keeps billing data (it already receives the Polar webhooks), keyed by the account id:
  - `subscriptions.account_id` (replaces `channel_id`);
  - `orders` (Polar `order.*`: id, account, product, amount, currency, status, created, refunded);
  - `credit_ledger` (append-only: `+amount` on a paid credits order, `−amount` for usage or a refund; balance = sum).
- **Billing page** (user): plan + status + expiry date, TR balance, payment history (orders with status), **monthly token spend** (tokens and USD per month over the user's channels, from `llm_calls`).
- FAQ entry: what trenni is, 1 TR = 1 USD, how spending is counted.

### Suspension (no plan or no trenni)

The plan gives access; model usage is paid from the TR balance at cost (OpenRouter prices; local models cost 0). A user's channels serve visitors only while **both** hold:

- a plan in effect: Polar status `active` or `trialing`, or any status while `now < current_period_end` (a canceled plan runs to the end of its paid period; `past_due` keeps working until the period end while Polar retries the card);
- balance > 0 TR.

**Where it is decided** — one pure function in the orchestrator, `accountStanding(subscription, balance, now) → { ok: true } | { ok: false, reason: "no_plan" | "plan_expired" | "no_balance", since }`, unit-tested on every edge (period end exactly now, canceled-at-period-end, past_due, balance exactly 0, negative).

**Where it is enforced** — the channel lookup that every widget/transport request already does (`ChannelDirectory`, in memory): each channel carries its owner's standing, so a message costs no extra DB query. Staff-owned channels (`owner_id` NULL) are never suspended. The standing is recomputed for one account when:

- a Polar webhook changes its subscription or adds an order (top-up/renewal **unblocks at once**);
- a model call is debited from its balance (the ledger write after each call; the call that crosses 0 finishes — a small overdraft is carried and must be covered by the next top-up);
- the plan's period end passes — no timer: the stored standing keeps `until = current_period_end` and the lookup compares it with `now`.

**What each side sees**

| Who | Suspended |
|---|---|
| Widget | `POST /v1/widget/visitors` and `/v1/widget/messages` answer `402 { code: "channel_suspended" }`; the widget shows a neutral "Chat is unavailable right now" and disables the composer (never billing details — visitors are the user's customers). A conversation in progress ends on its next message. |
| Telegram/CLI | `POST /v1/access` → `allowed: false, reason: "suspended"`; the bot stays silent, as for a blocked user. |
| User (panel) | A red alert in the header on every page: reason + link to **Billing** ("Your channels are paused: renew the plan" / "top up trenni"). Channels list: a "paused" badge per channel. |
| Staff | Users page: standing column; the user's channels show "paused (owner)". |

**Before it happens** — a yellow header alert (and one email) when the balance drops below 1 TR or the plan ends within 3 days. Each warning email is sent once per period (`account_notices` row: account, kind, period).

Nothing is deleted while suspended; the 180-day inactivity rule still counts from `last_active_at`.

## 5. Staff dashboard: spend and net profit

- **Model spend (USD)**: sum of `llm_calls` cost (OpenRouter prices; local models cost 0) for the period.
- **Revenue**: paid Polar orders in the period.
- **Net profit** = revenue − payment/payout/tax losses − model spend.
- The losses come from `packages/tax` (new): the formulas of `docs/trust/commision.md` as pure functions with the parameters as defaults (`C_polar = 0.70`, `r_polar = 0.079`, `r_payout = 0.015`, `r_tax = 0.03`, `r_conv = 0.02`), applied **per order** (the fixed fee is per receipt). Tests reproduce the document's example: P = $10 → losses $2.04, 20.4%.

## Data changes (destructive is allowed)

| Service | Change |
|---|---|
| admin-api | `user.level` int, `user.last_active_at`, `user.token_hash` (staff), drop "first account = super" logic |
| orchestrator | `users` → `visitors` (+ `name`), FKs and `messages`/`llm_calls` columns renamed; `channels.owner_id`; `subscriptions.channel_id` → `account_id`; new `orders`, `credit_ledger` |
| new package | `packages/tax` (+ its CLAUDE.md, a line in `architecture.md`) |

## Work split (subagents)

Each group owns its files. Orchestrator migrations are numbered in order, so the groups that add them run one after another (visitors → ownership → billing).

1. In parallel:
   - **1a Foundation** (admin-api auth + admin auth pages): `user.level`, staff token sign-in, `admin:create`, user register/login/forgot/reset + email verification (SMTP), `last_active_at` + inactivity job (deletes the account; its channels are handled in 2), guards by level, sidebar filtered by level, no header meter for users, Admins page (create → token once, edit name/email, rotate token).
   - **1b Visitors** (orchestrator `users` → `visitors` + generated names, admin-api proxy and live topics, admin `/visitors` page). In the shared sidebar files it only changes the users item.
   - **1c packages/tax** (pure, independent).
2. **Ownership + user panel** after 1a and 1b: `channels.owner_id`, scoping in admin-api (lists, writes, live topics), staff Users page, Settings page (name, email, delete account), deleting an account deletes its channels.
3. **Billing** after 2: Polar checkout via admin-api, orders/ledger/subscriptions by account, debit per model call, suspension, header alerts, Billing page, FAQ entry, staff dashboard spend/revenue/net profit.

Each group: tests first, `bun run test/lint/check-types` green, contract updates in `admin-api.md`, an entry in `lessons-learned.md` for the architecture change.

## Open questions

1. ~~Staff token~~ — **decided**: token instead of a password (shown once, stored as SHA-256); email is contact data only.
2. ~~Email transport~~ — **decided**: Gmail SMTP for `info@shalotts.site` (`smtp.gmail.com:465`, a Google app password) through `nodemailer` in admin-api; env `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`. Without `SMTP_PASS` the links are logged (dev). Gmail caps sending at ~500/day (Workspace ~2000); SPF of `shalotts.site` must include `_spf.google.com`.
3. ~~Plan vs trenni~~ — **decided**: the plan gives access; model usage is debited from the TR balance at cost.
4. ~~Balance 0 / plan expired~~ — **decided**: the user's channels are suspended, the widget stops, a header alert links to Billing (see "Suspension").
5. **Account deletion** — default: channels and visitor data go at once; `llm_calls` and orders stay for the money numbers with the account id cut off.
6. ~~Users and models~~ — **decided**: staff-only Agents/Models; users use what staff picked.
7. ~~cuid2~~ — **decided**: `@paralleldrive/cuid2`, length 6.
8. **Net profit period** — default: the dashboard's existing period; USD only.
