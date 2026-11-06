// Imports a generated data set and times the import and the main engine views.
//   node --experimental-strip-types --no-warnings scripts/bench.ts [small|medium] [folder]
// Targets: import under 3 s, every engine view under 100 ms.

import { readFileSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { importData } from "../lib/importer.ts";
import { linesOf, pnlOf, stockRowsOf } from "../lib/derived.ts";
import { cashWithCourier, closerStats, computePnl, leaks, openCycle, revenueFlow, stockRows, openLines, campaignStats, needsAttention, cashDesk, payoutQueue, skuEconomics, cloneState, payslipsFor, salesPeople, transition } from "../lib/engine.ts";
import { previewImpact } from "../lib/ask.ts";

const set = process.argv[2] ?? "small";
const root = process.argv[3] ?? path.join(os.homedir(), "Downloads", "kova-test-data");
const dir = path.join(root, set);
const read = (f: string) => (existsSync(path.join(dir, f)) ? readFileSync(path.join(dir, f), "utf8") : undefined);

const t0 = performance.now();
const res = importData({
  orders: read("orders.csv")!,
  staff: read("staff.csv"),
  products: read("products.csv"),
  leads: read("leads.csv"),
  adSpend: read("ad_spend.csv"),
  purchaseOrders: read("purchase_orders.csv"),
});
const importMs = performance.now() - t0;
if (!res.ok) {
  console.log("IMPORT FAILED");
  for (const e of res.errors.slice(0, 20)) console.log(`  ${e.file} line ${e.line} ${e.column ?? ""}: ${e.message}`);
  process.exit(1);
}
const s = res.state;
console.log(`${set}: imported ${res.summary.orders.toLocaleString()} orders, ${res.summary.staff} staff, ${res.summary.leads.toLocaleString()} leads, ${res.summary.weeks} weeks (${res.summary.firstWeek}-${res.summary.openWeek}) in ${importMs.toFixed(0)} ms`);
for (const n of res.summary.notes) console.log(`  note: ${n}`);
console.log(`  warnings: ${res.summary.warnings.length}`);

const time = (label: string, fn: () => unknown) => {
  const a = performance.now();
  fn();
  const ms = performance.now() - a;
  console.log(`  ${label.padEnd(22)} ${ms.toFixed(1).padStart(8)} ms ${ms > 100 ? "  <-- slow" : ""}`);
  return ms;
};
time("computePnl", () => computePnl(s));
time("openLines", () => openLines(s));
time("leaks", () => leaks(s));
time("revenueFlow", () => revenueFlow(s));
time("stockRows", () => stockRows(s));
time("needsAttention", () => needsAttention(s));
time("cashDesk", () => cashDesk(s));
time("payoutQueue", () => payoutQueue(s));
time("skuEconomics", () => skuEconomics(s));
time("cloneState", () => cloneState(s));
time(`payslips x${s.cycles.length} weeks`, () => s.cycles.forEach((c) => payslipsFor(c.status === "open" ? openLines(s) : (c.lines ?? []), salesPeople(s).map((x) => x.id))));
const someDelivered = s.orders.find((o) => o.stage === "delivered" && o.deliveredCycle === openCycle(s).id);
if (someDelivered) time("previewImpact (return)", () => previewImpact(s, { simulate: (d) => transition(d, someDelivered.id, "return", {}) ?? undefined }, undefined, "founder", {}, { lines: linesOf(s), pnl: pnlOf(s), stock: stockRowsOf(s), stuckCash: cashWithCourier(s).total }));
const closers = s.people.filter((p) => p.role === "closer");
const lines = openLines(s);
time(`closerStats x${closers.length}`, () => closers.forEach((c) => closerStats(s, c.id, lines)));
const buyers = s.people.filter((p) => p.role === "buyer");
time(`campaignStats x${buyers.length}`, () => buyers.forEach((b) => campaignStats(s, b.id, lines)));
console.log(`  open week ${openCycle(s).id}; ${s.cycles.map((c) => `${c.id}:${c.status}`).join(" ")}`);

const p = computePnl(s);
console.log(`  open week: revenue ${Math.round(p.revenue).toLocaleString()}, ads ${Math.round(p.adSpend).toLocaleString()}, commission ${Math.round(p.commission).toLocaleString()}, base ${Math.round(p.base).toLocaleString()}, actual ${Math.round(p.actual).toLocaleString()}`);
