import assert from "node:assert/strict";
import { buildSeed } from "../lib/seed.ts";
import {
  actionsFor,
  canEditRules,
  closeCycle,
  DELIVERY_FEE,
  closerStats,
  commissionLines,
  computePnl,
  discountPenalty,
  needsAttention,
  openCycle,
  openLines,
  paidOnUndelivered,
  payslip,
  raisePO,
  receivePO,
  reversals,
  stockRows,
  sum,
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

// 11. Stock on hand at cost reconciles to the spec (BLN-07 holds 12 after #1046's resellable return)
assert.equal(sum(s.products.map((p) => p.onHand * p.cost)), 1419000, "Stock on hand at cost should be ₦1,419,000");
assert.equal(s.products.find((p) => p.sku === "BLN-07")!.onHand, 12, "BLN-07 on hand should be 12");

// 12. Committed stock counts confirmed/dispatched orders only (delivered #1041 is not committed)
const air = stockRows(s).find((r) => r.product.sku === "AIR-12")!;
assert.equal(air.committed, 2, "AIR-12 committed = #1043 (dispatched) + #1049 (confirmed)");
assert.equal(air.available, 2, "AIR-12 available = 4 on hand − 2 committed");
assert.equal(sum(stockRows(s).map((r) => r.committed)), 6, "Units committed across SKUs should be 6");

// 13. Tobi net payout = pro-rated base + 1.5% of the ₦216,500 he delivered
const tobiSlip = payslip(openLines(s), "tobi");
assert.equal(tobiSlip.base, 27692);
assert.equal(tobiSlip.commission, 216500 * 0.015);
assert.equal(Math.round(tobiSlip.payable), 30940, "Tobi net payout should be ₦30,940");

// 14. Courier legs: 5 delivered + #1046 return leg + #1046 outbound = 7. Dispatched-not-delivered orders are not charged yet.
assert.equal(computePnl(s).logistics, 7 * DELIVERY_FEE, "W44 courier fees should be 7 legs × ₦3,500");

// 15. Commission paid on orders that have not landed: none under Delivery, ₦31,404 under Lead
assert.equal(paidOnUndelivered(s).total, 0, "No pre-delivery payout under the Delivery trigger");
const sLead = structuredClone(s);
sLead.rules.creditOn = "lead";
assert.equal(Math.round(paidOnUndelivered(sLead).total), 31404, "Paid on undelivered under Lead should be ₦31,404");

console.log("ALL 15 ENGINE INVARIANTS PASSED.");

