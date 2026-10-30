import assert from "node:assert/strict";
import { buildSeed } from "../lib/seed.ts";
import { L, PNL_TEXT, RULE_TEXT, PAY_LINE_TEXT } from "../lib/labels.ts";
import { RULE_DEFS } from "../lib/rules.ts";
import {
  actionsFor,
  adCost,
  profitPerOrder,
  campaignStats,
  skuEconomics,
  canEditRules,
  closeCycle,
  createOrder,
  orderValue,
  setProductPrice,
  DELIVERY_FEE,
  closerStats,
  commissionLines,
  computePnl,
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
assert.equal(pnlCommOnly.revenue, 532500, "Delivered revenue in W44 should be ₦532,500");
assert.equal(pnlCommOnly.cogs, 222500, "COGS in W44 should be ₦222,500");
assert.equal(Math.round(pnlCommOnly.commission), 34613, "Sales pay in W44 should be ₦34,613");
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

// 5. One company price per SKU: no discounts, order value = unit price × qty, closer pay is 4% of it
const o1049 = s.orders.find((o) => o.id === 1049)!;
assert.equal(orderValue(o1049), 212000, "AIR-12 sells at the company price");
const lines1049 = commissionLines(s, { ...o1049, stage: "delivered" }, s.rules, "W44");
assert.equal(lines1049.find((l) => l.personId === "amaka")!.amount, 212000 * 0.04, "Closer rate is a flat 4%, nothing halves it");
assert.equal("discount" in o1049 || "list" in o1049, false, "Orders carry no discount or list-price fields");

// 6. Split credit on #1053 (opened by Amaka, closed by Chidi)
const o1053 = s.orders.find((o) => o.id === 1053)!;
const firstTouch = commissionLines(s, { ...o1053, stage: "delivered" }, { ...s.rules, split: "first" }, "W44");
const lastTouch = commissionLines(s, { ...o1053, stage: "delivered" }, { ...s.rules, split: "last" }, "W44");
const halfTouch = commissionLines(s, { ...o1053, stage: "delivered" }, { ...s.rules, split: "half" }, "W44");
assert.equal(firstTouch.some((l) => l.personId === "amaka" && l.amount === 73500 * 0.04), true);
assert.equal(lastTouch.some((l) => l.personId === "chidi" && l.amount === 73500 * 0.04), true);
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

// 13. Tobi net payout = pro-rated base + 1.5% of the ₦202,000 he delivered
const tobiSlip = payslip(openLines(s), "tobi");
assert.equal(tobiSlip.base, 27692);
assert.equal(tobiSlip.commission, 202000 * 0.015);
assert.equal(Math.round(tobiSlip.payable), 30722, "Tobi net payout should be ₦30,722");

// 14. Courier legs: 5 delivered + #1046 return leg + #1046 outbound = 7. Dispatched-not-delivered orders are not charged yet.
assert.equal(computePnl(s).logistics, 7 * DELIVERY_FEE, "W44 courier fees should be 7 legs × ₦3,500");

// 15. Commission paid on orders that have not landed: none under Delivery, ₦34,210 under Lead
assert.equal(paidOnUndelivered(s).total, 0, "No pre-delivery payout under the Delivery trigger");
const sLead = structuredClone(s);
sLead.rules.creditOn = "lead";
assert.equal(Math.round(paidOnUndelivered(sLead).total), 34210, "Paid on undelivered under Lead should be ₦34,210");

// 16. Plain language: none of the old accounting terms reach the screen via labels, rules or drills
const OLD_TERMS = /COGS|cost of goods|naive|core actual|full operating|variable commission|fixed base|base pay|override|ROAS|clawback|claw back|clawed|write-off|courier leg|payout ratio|credit a sale|refund.*(staff|commission)|prospecting|retargeting/i;
const flatten = (v: unknown): string[] =>
  typeof v === "string" ? [v] : typeof v === "function" ? [] : v && typeof v === "object" ? Object.values(v).flatMap(flatten) : [];
const drillText = (d: { title: string; subtitle?: string; lines: { ref: string; label: string; detail?: string }[] }) =>
  [d.title, d.subtitle ?? "", ...d.lines.flatMap((l) => [l.ref, l.label, l.detail ?? ""])];
const pnlNow = computePnl(s);
const screenText = [
  ...flatten(L),
  ...flatten(PNL_TEXT),
  ...flatten(RULE_TEXT),
  ...flatten(PAY_LINE_TEXT),
  PNL_TEXT.revenue.sub("W44"),
  L.headline("6.5%"),
  L.deliveryFeeNote(3500),
  ...RULE_DEFS.flatMap((d) => [d.label, ...d.options.map((o) => o.label), d.explain(s.rules)]),
  ...Object.values(pnlNow.drills).flatMap(drillText),
  ...drillText(profitPerOrder(s).beforeDrill),
  ...drillText(profitPerOrder(s).afterDrill),
  ...s.people.map((p) => p.title),
  ...["tobi", "zainab"].flatMap((b) => drillText(campaignStats(s, b).marginDrill)),
  ...skuEconomics(s).flatMap((e) => drillText(e.drill)),
  ...closerStats(s, "amaka").contributionDrill.lines.flatMap((l) => [l.label, l.detail ?? ""]),
  ...openLines(s).map((l) => l.note),
];
for (const text of screenText) assert.equal(OLD_TERMS.test(text), false, "Old accounting term on screen: " + text);
assert.equal(L.realProfit, "Real profit");
assert.equal(`${L.payTakenBack}|${L.refunds}`, "Pay taken back|Refunds", "Pay taken back (staff) and Refunds (customers) stay separate terms");

// 17. Profit per order = (revenue − product cost − ad spend) ÷ delivered orders, before and after staff pay
const ppo = profitPerOrder(s);
assert.equal(ppo.orders, 5, "W44 has 5 delivered orders");
assert.equal(ppo.before, (532500 - 222500 - 281000) / 5, "Profit per order before staff pay should be +₦5,800");
assert.equal(ppo.after, ppo.before - (computePnl(s).commission + computePnl(s).base) / 5, "After staff pay subtracts sales pay and fixed salary per order");
assert.equal(Math.round(ppo.after), -25584);
assert.equal(Math.abs(ppo.beforeDrill.total - ppo.before) < 1e-6 && Math.abs(ppo.afterDrill.total - ppo.after) < 1e-6, true, "Drill totals match the figures");

// 18. Any media buyer can run any campaign; max cost per order is a flag and never moves pay
assert.equal(s.maxCostPerOrder, 4000, "Default max cost per order is ₦4,000");
assert.equal(s.orders.some((o) => o.campaign !== undefined), false, "No fixed campaign labels on seed orders");
const tobiCost = adCost(s, "tobi");
const zainabCost = adCost(s, "zainab");
assert.equal(tobiCost.costPerOrder, 185000 / 2);
assert.equal(zainabCost.costPerOrder, 96000 / 3);
assert.equal(tobiCost.overMax && zainabCost.overMax, true, "Both buyers are over ₦4,000 per delivered order on the seed");
const sLoose = structuredClone(s);
sLoose.maxCostPerOrder = 100000;
assert.equal(adCost(sLoose, "tobi").overMax || adCost(sLoose, "zainab").overMax, false, "A higher max clears the flags");
assert.equal(computePnl(sLoose).payout, computePnl(s).payout, "Max cost per order does not change pay");
assert.equal(computePnl(sLoose).actual, computePnl(s).actual, "Max cost per order does not change real profit");

// 19. Prices: every seed order is exactly its SKU price × qty; a price change only affects new orders
for (const o of s.orders) {
  const price = s.products.find((p) => p.sku === o.sku)!.price;
  assert.equal(orderValue(o), price * o.qty, "Order " + o.id + " value must equal unit price × qty");
}
const sPrice = structuredClone(s);
assert.equal(setProductPrice(sPrice, "AIR-12", 230000), null);
assert.equal(orderValue(sPrice.orders.find((o) => o.id === 1041)!), 212000, "Existing orders keep the price they were created at");
const fresh = createOrder(sPrice, { customer: "Test", city: "Lagos", sku: "AIR-12", qty: 2, openedBy: "amaka", closer: "amaka", buyer: "tobi" });
assert.equal(orderValue(fresh), 460000, "New orders use the updated price");
assert.notEqual(setProductPrice(sPrice, "AIR-12", 0), null, "A zero price is rejected");

// 20. The pay rules are exactly five, none of them a discount rule; the return-rate gate is 1.0× or 0.5× only
assert.deepEqual(RULE_DEFS.map((d) => d.key), ["creditOn", "onReturn", "split", "payModel", "returnCap"]);
assert.equal("discountFloor" in s.rules || "discountFloor" in s.rulesMeta, false);
const gated = commissionLines(structuredClone(s), s.orders.find((o) => o.id === 1045)!, { ...s.rules, returnCap: 0.3 }, "W44");
const ungated = commissionLines(structuredClone(s), s.orders.find((o) => o.id === 1045)!, { ...s.rules, returnCap: 1 }, "W44");
const ratio = gated.find((l) => l.personId === "amaka")!.amount / ungated.find((l) => l.personId === "amaka")!.amount;
assert.equal(ratio, 0.5, "Gate halves a breaching closer once, never 0.25×");
// segregation of duties: nobody can discount, and closers still cannot certify their own deliveries
for (const role of ["founder", "closer", "buyer", "lead", "stock"] as const) {
  for (const o of s.orders) assert.equal((actionsFor(s, role, o) as string[]).includes("discount"), false);
}

console.log("ALL 20 ENGINE INVARIANTS PASSED.");

