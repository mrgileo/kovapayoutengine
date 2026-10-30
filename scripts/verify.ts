import assert from "node:assert/strict";
import { buildSeed } from "../lib/seed.ts";
import {
  actionsFor,
  canEditRules,
  closeCycle,
  closerStats,
  commissionLines,
  computePnl,
  discountPenalty,
  needsAttention,
  openCycle,
  openLines,
  payslip,
  raisePO,
  receivePO,
  reversals,
  transition,
  whatIf,
} from "../lib/engine.ts";

const s = buildSeed();

// 1. Permissions & segregation of duties
assert.equal(canEditRules("founder"), true);
assert.equal(canEditRules("closer"), false);
assert.equal(canEditRules("stock"), false);
const dispatchedOrder = s.orders.find((o) => o.id === 1043)!;
assert.equal(actionsFor(s, "closer", dispatchedOrder).includes("deliver"), false, "Closer must not mark own order delivered");
assert.equal(actionsFor(s, "stock", dispatchedOrder).includes("deliver"), true, "Warehouse can mark delivered");

// 2. Real P&L vs naive net
const pnlCommOnly = computePnl(s, { ...s.rules, payModel: "commission" });
assert.equal(pnlCommOnly.revenue, 447500, "Delivered revenue in W44 should be ₦447,500");
assert.equal(pnlCommOnly.cogs, 222500, "COGS in W44 should be ₦222,500");
assert.equal(Math.round(pnlCommOnly.commission), 29088, "Commission in W44 should be ₦29,088");
assert.equal(pnlCommOnly.adSpend, 281000, "Ad spend in W44 should be ₦281,000");
assert.equal(pnlCommOnly.actual < 0, true, "Business is underwater once real costs are counted");

// 3. Cycles & post-close returns (clawback vs offset vs locked)
const sClaw = structuredClone(s);
transition(sClaw, 1033, "return", { condition: "resellable" }); // W43 paid order
assert.equal(reversals(sClaw, sClaw.rules).clawbacks.length > 0, true, "Returning a W43 paid order creates clawbacks");
const sOffset = structuredClone(sClaw);
sOffset.rules.onReturn = "offset";
assert.equal(reversals(sOffset, sOffset.rules).deferred.length > 0, true, "Offset policy schedules next-cycle deductions");
closeCycle(sOffset, "chidinma", "2026-10-29T18:00:00Z");
assert.equal(openCycle(sOffset).carryIn.some((l) => l.kind === "offset"), true, "Next cycle receives offset carry-in");

// Returning a W42 locked order
const sLocked = structuredClone(s);
transition(sLocked, 1024, "return", { condition: "resellable" });
assert.equal(reversals(sLocked, sLocked.rules).absorbed.length > 0, true, "Returning a locked-cycle order is absorbed");

// 4. Return rate per closer
const amakaStats = closerStats(s, "amaka");
const chidiStats = closerStats(s, "chidi");
assert.equal(amakaStats.returnRate > chidiStats.returnRate, true, "Amaka has higher return rate than Chidi");

// 5. Discount guardrail on #1049 (15% > 10% floor)
const o1049 = s.orders.find((o) => o.id === 1049)!;
assert.equal(discountPenalty(o1049, s.rules), true, "Order 1049 breaches the 10% discount floor");
const lines1049 = commissionLines(s, { ...o1049, stage: "delivered" }, s.rules, "W44");
const amaka1049 = lines1049.find((l) => l.personId === "amaka")!;
assert.equal(amaka1049.amount, Math.round(245000 * 0.85) * 0.02, "Closer rate halves from 4% to 2% on discounted value");

// 6. Split credit on #1053 (opened by Amaka, closed by Chidi)
const o1053 = s.orders.find((o) => o.id === 1053)!;
const firstTouch = commissionLines(s, { ...o1053, stage: "delivered" }, { ...s.rules, split: "first" }, "W44");
const lastTouch = commissionLines(s, { ...o1053, stage: "delivered" }, { ...s.rules, split: "last" }, "W44");
const halfTouch = commissionLines(s, { ...o1053, stage: "delivered" }, { ...s.rules, split: "half" }, "W44");
assert.equal(firstTouch.some((l) => l.personId === "amaka" && l.amount === 88000 * 0.04), true);
assert.equal(lastTouch.some((l) => l.personId === "chidi" && l.amount === 88000 * 0.04), true);
assert.equal(halfTouch.filter((l) => l.personId === "amaka" || l.personId === "chidi").length, 2);

// 7. Inventory loop: Raise PO clears alert, Receive PO adds onHand
const sStock = structuredClone(s);
const beforeAlerts = needsAttention(sStock).length;
assert.equal(beforeAlerts > 0, true);
for (const row of needsAttention(sStock)) {
  raisePO(sStock, row.product.sku, row.suggested, "dayo", "2026-10-29T12:00:00Z");
}
assert.equal(needsAttention(sStock).length, 0, "Raising POs clears reorder alerts");
const poId = sStock.pos[0].id;
const sku = sStock.pos[0].sku;
const beforeOnHand = sStock.products.find((p) => p.sku === sku)!.onHand;
receivePO(sStock, poId, "2026-10-30T12:00:00Z");
const afterOnHand = sStock.products.find((p) => p.sku === sku)!.onHand;
assert.equal(afterOnHand > beforeOnHand, true, "Receiving PO increments onHand");

// 8. Lead-credit rate drop comparison
const simDel = whatIf(s, { creditOn: "delivered" });
const simLead = whatIf(s, { creditOn: "lead" });
const simCash = whatIf(s, { creditOn: "cash" });
assert.equal(simLead.commission > simDel.commission, true, "Even at 2.75% rate, Lead trigger pays more than 6.5% on Delivered");
assert.equal(simCash.commission < simDel.commission, true, "Cash-in trigger withholds commission on unremitted COD orders");

// 9. Base + variable pay structure
const slipBase = payslip(openLines(s, { ...s.rules, payModel: "base_plus" }), "amaka");
const slipComm = payslip(openLines(s, { ...s.rules, payModel: "commission" }), "amaka");
assert.equal(slipBase.base > 0 && slipComm.base === 0, true);

// 10. Return-rate quality gate (30% cap halves Amaka's commission since her return rate is 37.5%, while Chidi stays at 100%)
const amakaUngated = payslip(openLines(s, { ...s.rules, returnCap: 1 }), "amaka").commission;
const amakaGated = payslip(openLines(s, { ...s.rules, returnCap: 0.3 }), "amaka").commission;
const chidiUngated = payslip(openLines(s, { ...s.rules, returnCap: 1 }), "chidi").commission;
const chidiGated = payslip(openLines(s, { ...s.rules, returnCap: 0.3 }), "chidi").commission;
assert.equal(Math.round(amakaGated), Math.round(amakaUngated * 0.5), "30% return cap halves Amaka's commission");
assert.equal(Math.round(chidiGated), Math.round(chidiUngated), "30% return cap leaves Chidi untouched");

console.log("ALL 10 ENGINE INVARIANTS PASSED.");

