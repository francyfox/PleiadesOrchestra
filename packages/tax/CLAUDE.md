# @repo/tax internals

See root `CLAUDE.md` for monorepo commands and style.

Pure, dependency-free order economics: `orderBreakdown(price, rates?)` and `netProfit({ orders, modelSpend }, rates?)`, USD numbers, no rounding (callers format). `Rates.taxBase` (`payout` default, `revenue`, `profit`) picks what the tax is taken from; `profit` is taxed once per period in `netProfit`, never per order. Invalid (negative / non-finite) input throws `RangeError`. A price below the fixed fee gives negative `net` on purpose.

Formulas and default rates: `docs/trust/commision.md` (Kazakhstan sole proprietor, simplified regime, Polar as Merchant of Record). Used by the orchestrator's `modules/finance` for the staff dashboard (`docs/trust/drafts/accounts-and-billing-plan.md`, section 5).

Tests: `bun --cwd packages/tax test`.
