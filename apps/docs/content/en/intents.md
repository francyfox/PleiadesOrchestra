---
title: Intents
---

# Intents

An **intent** is what the orchestrator thinks a message wants to do: search, add something, open a page, pay, or just chat. The planner turns the intent into a goal and picks tools that can reach it.

## Current behaviour

Today there is one fixed taxonomy, written for an online shop (`packages/core/src/goap/intent-taxonomy.ts`). It is the shop-domain layer of the planner; everything else (tool names, schemas, descriptions) comes from the site.

| Intent | Meaning |
| --- | --- |
| `chat` | Small talk; no tool is needed. |
| `chooseStore` | Go to or switch to a particular store. |
| `navigate` | Open a page of the site. |
| `search` | Look for items or ask what is available. |
| `filter` | Narrow results. |
| `select` | Open or pick one item from the results. |
| `addToCart` | Buy something or put it in the cart. |
| `removeFromCart` | Take something out. |
| `checkout` | Pay and place the order. |
| `paginate` | More results, next page. |
| `compare` | Compare items. |
| `other` | Anything else. |

(`readState` also exists, but only as a *tool* role: a tool that reads what the site holds, such as a cart or bookings. A message is never classified as `readState`.)

Each intent has fixed effects and preconditions (for example, `addToCart` needs a store open, a search done and a parsed request). The planner chains tools through them. A tool is assigned an intent from its name (see [Tools](/docs/tools/#How-the-orchestrator-reads-a-tool)).

### How a message is classified

In this order, first match wins:

1. **Words.** Lexical rules decide `checkout` and `removeFromCart` only. They are checked against the original text and its English translation, in English and Russian.
2. **Site memory.** Per channel, a small classifier trained on examples an administrator approved (or that were auto-approved at high confidence). It stays silent below 0.85 confidence and is never used for `checkout` or `removeFromCart`.
3. **Laya**, the decision model, on the English translation of the message. Its answer for `checkout` and `removeFromCart` is discarded and treated as `chat`.
4. **Fallback** to `chat` if Laya fails or returns nothing valid (the words are tried once more first).

`checkout` and `removeFromCart` have side effects that cannot be undone by replanning, so they come only from explicit words in the message. A model guess alone never pays or empties a cart.

Laya's answers are stored per channel as examples. Each one is `pending` until an administrator approves, rejects or corrects it on the admin panel's **Intents** page, or until its calibrated confidence reaches `LAYA_AUTO_APPROVE_CONFIDENCE` (default 0.85) and it is approved automatically. An approved example changes what the channel's memory answers next time.

### What this means off-shop

The taxonomy fits sites where the visitor searches, adds and pays. On other sites some actions have no matching intent. The pizza-size example: "make the pizza bigger" may be read as `addToCart`, and a tool like `set_pizza_size`, which is classified `other` and has no effects, cannot become the goal of a plan. This is the known limit that the planned work below removes.

## Planned: intent packs per channel

> **Planned, not implemented.** Tracked as GitHub issue PO-41. Nothing below works yet.

The idea is that the intent set belongs to the channel, not to the code:

- **Built-in "Online shop" pack.** The current taxonomy above, with its Laya descriptions, effects, preconditions, the "only by explicit words" rule for `checkout` and `removeFromCart`, and its step texts. Read-only; copy and edit, like agent profiles.
- **Channel without a pack** (planned default for new channels). A message picks the site's tool directly: Laya chooses by tool name and description (plus `chat`), and the goal is that tool's result. No taxonomy, so it works on any site.
- **Existing channels** are migrated to the "Online shop" pack, so their behaviour does not change.
- **Admin panel.** Choose the pack in channel settings; a screen for the pack.

<!-- TODO: PO-41 is OPEN at the time of writing; re-read `gh issue view 41` before publishing and update this section. The issue also plans a "when to take a ready pack, when to work without one" guide for these docs. -->
