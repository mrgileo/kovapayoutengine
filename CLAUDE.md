# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A client-only Next.js 15 / React 19 demo of a payout, P&L and stock engine for COD (cash-on-delivery) e-commerce operators. Money is in naira (NGN) with a display-currency toggle. There is no backend or database: all state lives in the browser. `Kova_Payout_Engine_Full_Specification_and_Guide.docx` is the product spec; `scripts/generate-docx.mjs` regenerates it (dependency-free OOXML/ZIP writer).

## Commands

```
npm run dev         # next dev (http://localhost:3000)
npm run build       # next build
npm run typecheck   # tsc --noEmit
npm test            # node --experimental-strip-types --no-warnings scripts/verify.ts
node scripts/e2e.mjs  # headless-Chrome CDP smoke test; needs `npm run dev` running
```

- `npm test` is a single plain-assert script over the engine (no test framework), so there is no per-test filter. To run one scenario, comment out the others or add a temporary script that imports from `lib/*.ts`.
- `scripts/e2e.mjs` hardcodes a Windows Chrome path (`C:\Program Files\Google\Chrome\...`), port 9229, and a `--user-data-dir` under another tool's scratch folder. Adjust these before relying on it.
- No linter is configured.

## Architecture

**Layering is strict: `lib/engine.ts` is a pure calculation layer** (no React, no storage). Every figure shown in the UI is derived from `DemoState` by engine functions, which is what lets each number open a `Drill` (the list of orders/lines behind it). New figures should be computed in the engine and return a `Drill` rather than being computed in components.

- `lib/types.ts`: the domain model. `DemoState` is the single persisted blob (people, products, orders, cycles, rules, spend, POs, audit log).
- `lib/engine.ts`: crediting rules (`isCredited`, `commissionLines`, `reversals`), payslips, `computePnl`, `whatIf` (recompute under hypothetical rules), per-closer/campaign/SKU stats, stock status, the order state machine (`transition`, `actionsFor`) and the cycle lifecycle (`closeCycle` → `markPaid` → `lockCycle`). Mutators take a draft `DemoState` plus `actor`/`at` and write audit entries via `log`.
- `lib/rules.ts`: UI definitions (labels, options, explanatory copy) for the five tunable `Rules`; the wording itself lives in `lib/labels.ts`, the single source of display text (internal keys never change, only labels). It imports rates from the engine, so explanatory text stays in sync with the numbers.
- `lib/seed.ts`: `buildSeed()` produces the demo dataset, including closed past cycles built by running the real engine. **Bump `SEED_VERSION` whenever the seed or the `DemoState` shape changes**: the store's persist `migrate` just discards stored data and re-seeds.
- **Roles and money permissions** (`lib/engine.ts`): six personas (`Role`): founder, closer, buyer, lead, accountant, stock. `actionsFor()` is the order-action matrix and is enforced in the store too (`act` refuses anything it does not list). Money steps are split on purpose: `canApprove` (close & approve the week) is founder-only; `canSettle` (mark paid, lock, export the bank file) is founder + accountant; `canRecordCash` (courier cash) is founder + accountant, never the warehouse. `cashDesk()` / `payoutQueue()` feed `components/AccountantView.tsx`.
- `lib/importer.ts`: pure CSV import ("Try it with your orders"). Parses orders / optional ad-spend / optional products files and replays weekly cycles through `closeCycle` → `markPaid` → `lockCycle` to build a `DemoState`. The UI is `components/ImportDialog.tsx`; the store tracks `dataSource` (`demo` | `imported`) and persists it. Imported data never leaves the browser, and every imported order is credited to the single stand-in buyer id `tobi` (named "Imported Ads").
- `lib/deeplink.ts`: pure parse/build of shared links (`?role=…&creditOn=…`). `App.tsx` applies one on load via the store's `applyDeepLink` (rule links reset to the demo seed first and go through `setRule`, so they hit the audit log; imported data is never overwritten), then strips the query. `app/opengraph-image.tsx` / `twitter-image.tsx` generate the link-preview card at build time (the naira sign is drawn, because the default OG font has no ₦ glyph).
- `lib/store.ts`: Zustand store with `persist` to localStorage (key `kova-payout-engine`; only `data`, `role`, `ccy`, `dataSource`, `importSummary` are persisted, through a debounced writer that flushes on page hide and warns when the quota is full). Actions wrap engine mutators, enforce role permissions, and emit toasts. `mutate` copies state with the engine's `cloneState()` (about 1 ms at 5,000 orders versus ~200 ms for `structuredClone`): that copy shares each cycle's frozen `lines`, `pnl` and `carryIn`, so **engine mutators must replace those, never edit them in place**. `verify.ts` checks that no mutator touches the state it was cloned from. UI-only state (open drill, modals) is not persisted.
- `components/Tour.tsx`: the guided tour. Each step calls the store's own actions (so it obeys the permission matrix and writes the audit log), switches persona, then outlines a target element. Steps must stay idempotent (Back re-runs them).
- `components/`: `App.tsx` is the shell and routes by `role`; there is one view per persona (`PERSONA` in the engine maps role → default person: closer=amaka, buyer=tobi, lead=ngozi, stock=dayo, founder=chidinma). `Overlays.tsx` holds the drill-down, return/discount dialogs, new-order and guide modals. `ui.tsx` has shared primitives.
- `app/page.tsx` just renders `<App />`.

## Domain rules to preserve

- Crediting is driven by `rules.creditOn` (`lead` | `delivered` | `cash`), with different rate tables in `RATES`; `onReturn` (`clawback` | `offset` | `absorb`) decides what happens to commission on already-credited orders that return. Offsets become `carryIn` lines on the next cycle.
- There are no discounts. Each SKU has one company `Product.price`; every order stores `unitPrice` at creation and `orderValue = unitPrice × qty`, so a founder price change only affects new orders. `returnCap` halves a closer's cycle commission (1.0× or 0.5× only) if their return rate exceeds it.
- Segregation of duties is enforced in `actionsFor` (e.g. a closer cannot mark their own order delivered; only the founder can edit rules via `canEditRules`). `scripts/verify.ts` asserts these, so update it alongside behaviour changes.
- Closed cycles freeze `lines` and `pnl`; the open cycle is always recomputed live.

## Conventions

- Imports inside `lib/` use explicit `.ts` extensions (needed because `verify.ts` runs under Node's type stripping). `store.ts` and components use the `@/*` alias or extensionless paths via Next's bundler.
- Because `verify.ts` runs under `--experimental-strip-types`, `lib/` files imported by it must avoid TS-only runtime syntax (enums, parameter properties) and must not import React or browser APIs.
