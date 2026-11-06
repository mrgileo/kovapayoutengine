// Cached versions of the heavy engine calculations, for the UI.
//
// The store never edits a state after it is published: every action copies it first (store.mutate -> cloneState).
// So a published DemoState object is immutable in practice, and "same object" means "same numbers".
// That makes the object itself a safe cache key: each figure is computed once per change instead of once per component.
//
// Use these only on states that came from the store. Code that edits a state in place (engine mutators, tests)
// must keep calling the plain engine functions.

import type { DemoState } from "./types.ts";
import {
  cashDesk,
  cashGap,
  computePnl,
  leadFunnel,
  leaks,
  needsAttention,
  openLines,
  payoutQueue,
  revenueFlow,
  skuEconomics,
  stockRows,
} from "./engine.ts";

function once<T>(fn: (s: DemoState) => T): (s: DemoState) => T {
  const cache = new WeakMap<DemoState, T>();
  return (s) => {
    let v = cache.get(s);
    if (v === undefined) cache.set(s, (v = fn(s)));
    return v;
  };
}

export const linesOf = once((s) => openLines(s));
// These all need this week's pay lines, so they share one copy instead of each working it out again.
export const pnlOf = once((s) => computePnl(s, s.rules, linesOf(s)));
export const leaksOf = once((s) => leaks(s, linesOf(s)));
export const flowOf = once((s) => revenueFlow(s, pnlOf(s)));
export const funnelOf = once((s) => leadFunnel(s));
export const cashDeskOf = once((s) => cashDesk(s));
export const payoutQueueOf = once((s) => payoutQueue(s));
export const cashGapOf = once((s) => cashGap(s));
export const stockRowsOf = once((s) => stockRows(s));
export const needsAttentionOf = once((s) => needsAttention(s));
export const skuEconomicsOf = once((s) => skuEconomics(s, linesOf(s)));
