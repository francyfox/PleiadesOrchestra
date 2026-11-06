# @repo/tax internals

See root `CLAUDE.md` for monorepo commands and style.

Pure, dependency-free order economics: `orderBreakdown(price, rates?)` and `netProfit({ orders, modelSpend }, rates?)`, `creditFor(paid, rates, marginShare)` (net minus the margin share, >= 0, margin in [0, 1)), USD numbers, no rounding (callers format). `Rates.taxBase` (`payout` default, `revenue`) picks what the tax is taken from; both are per order, so the tax is always deducted from a top-up's credit (a `profit` base was removed: it left the tax out of the credit, and a simplified-regime tax is on income). Invalid (negative / non-finite) input throws `RangeError`. A price below the fixed fee gives negative `net` on purpose.

Formulas and default rates: `docs/trust/commision.md` (Kazakhstan sole proprietor, simplified regime, Polar as Merchant of Record). Used by the orchestrator's `modules/finance` for the staff dashboard (`docs/trust/drafts/accounts-and-billing-plan.md`, section 5).

Tests: `bun --cwd packages/tax test`.
