import assert from "node:assert/strict";
import { buildSeed } from "../lib/seed.ts";
import { TEMPLATES, importData, isoWeekNumber, parseCsv } from "../lib/importer.ts";
import { L, PNL_TEXT, RULE_TEXT, PAY_LINE_TEXT } from "../lib/labels.ts";
import { RULE_DEFS } from "../lib/rules.ts";
import {
  actionsFor,
  adCost,
  cashWithCourier,
  leaks,
  revenueFlow,
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
  ...flatten(L.leak),
  ...Object.values(L.flowStepLabel),
  ...Object.values(L.flowStepHint),
  ...revenueFlow(s).steps.flatMap((st) => [...drillText(st.drill), ...st.drops.map((d) => d.label)]),
  ...leaks(s).flatMap((l) => drillText(l.drill)),
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

// 21. Import: the shipped templates produce a working dashboard through the same engine
assert.equal(isoWeekNumber("2026-10-26"), 44, "26 Oct 2026 is ISO week 44 (the demo W44)");
assert.equal(isoWeekNumber("2026-10-12"), 42);
const imp = importData({ orders: TEMPLATES.orders, adSpend: TEMPLATES.adSpend, products: TEMPLATES.products });
assert.equal(imp.ok, true, "Templates must import cleanly");
if (imp.ok) {
  const st = imp.state;
  assert.equal(imp.summary.orders, 6);
  assert.equal(imp.summary.weeks, 2);
  assert.deepEqual(st.cycles.map((c) => c.id + ":" + c.status), ["W43:paid", "W44:open"]);
  assert.equal(st.spend.W43.tobi, 75000, "Ad spend is summed into its Monday–Sunday week");
  assert.equal(st.spend.W44.tobi, 75000);
  for (const o of st.orders) assert.equal(orderValue(o), o.unitPrice * o.qty);
  const pnl = computePnl(st);
  assert.equal(pnl.cycleId, "W44");
  assert.equal(pnl.revenue, 187000, "Only #3004 is delivered in the open week");
  assert.equal(pnl.adSpend, 75000);
  assert.equal(pnl.cogs, 96000);
  assert.equal(st.people.some((p) => p.id === "zainab"), false, "One imported media buyer");
  assert.equal(st.audit.some((a) => a.text.includes("Imported 6 orders")), true);
  assert.equal(payslip(openLines(st), "amaka").gross >= 0, true);
  assert.equal(stockRows(st).length, 5);
  assert.equal(imp.summary.adSpendTotal, 150000);
}

// 22. Import: bad files fail with the line, the column and a plain message (and never throw)
const HDR = "order_id,date,customer,city,sku,qty,price,stage,closer,campaign\n";
const bad = importData({
  orders:
    HDR +
    "1,2026-13-40,A,Lagos,AIR-12,1,212000,delivered,amaka,\n" +
    "1,2026-10-20,B,Lagos,AIR-12,0,212000,delivered,amaka,\n" +
    "2,2026-10-20,C,Lagos,ZZZ-99,1,5000,teleported,nobody,\n" +
    "3,2026-10-20,D,Lagos,ZZZ-99,1,abc,delivered,chidi,\n",
});
assert.equal(bad.ok, false);
if (!bad.ok) {
  const has = (line: number, column: string) => bad.errors.some((e) => e.line === line && e.column === column);
  assert.equal(has(2, "date"), true, "Impossible date");
  assert.equal(has(3, "order_id"), true, "Duplicate id");
  assert.equal(has(3, "qty"), true, "Zero quantity");
  assert.equal(has(4, "stage"), true, "Unknown stage");
  assert.equal(has(4, "closer"), true, "Unknown closer");
  assert.equal(has(5, "price"), true, "Non-numeric price");
}
const ROW = HDR + "1,2026-10-20,A,Lagos,ZZZ-99,1,5000,delivered,amaka,\n";
const noCost = importData({ orders: ROW });
assert.equal(noCost.ok === false && noCost.errors.some((e) => e.column === "sku" && /no product cost/.test(e.message)), true, "Unknown SKU without a cost is an error");
assert.equal(importData({ orders: ROW, products: "sku,name,cost,on_hand\nZZZ-99,Widget,2000,4\n" }).ok, true, "A products file supplies the missing cost");
assert.equal(importData({ orders: "order_id,date\n1,2026-10-20\n" }).ok, false, "Missing columns");
assert.equal(importData({ orders: "" }).ok, false, "Empty file");
assert.equal(importData({ orders: "not,a,real\nfile,at,all" }).ok, false);
const OK_ROW = HDR + "1,2026-10-20,A,Lagos,AIR-12,1,212000,delivered,amaka,\n";
assert.equal(importData({ orders: OK_ROW, adSpend: "date,amount\n2026-10-20,lots\n" }).ok, false, "Bad ad-spend rows fail too");
assert.equal(importData({ orders: HDR + "1,2024-01-01,A,Lagos,AIR-12,1,212000,delivered,amaka,\n2,2026-10-20,B,Lagos,AIR-12,1,212000,delivered,amaka,\n" }).ok, false, "Spans over 26 weeks are refused");

// 23. Import: CSV reader handles quotes, commas in names, ₦ and thousands separators, BOM and CRLF
assert.deepEqual(parseCsv('﻿a,b\r\n"x, y","say ""hi"""\r\n').map((r) => r.cells), [["a", "b"], ["x, y", 'say "hi"']]);
const messy = importData({ orders: HDR.replace("\n", "\r\n") + '9,2026-10-20,"Obi, Ada",Lagos,air-12,1,"₦212,000",Delivered,Amaka Obi,"Promo, big"\r\n' });
assert.equal(messy.ok, true);
if (messy.ok) {
  const o = messy.state.orders[0];
  assert.equal(o.customer, "Obi, Ada");
  assert.equal(o.unitPrice, 212000);
  assert.equal(o.sku, "AIR-12");
  assert.equal(o.closer, "amaka");
  assert.equal(o.campaign, "Promo, big");
}

// 24. Revenue flow: each step is "reached this stage or beyond", drop-offs explain every gap, and it ties to the P&L
const flow = revenueFlow(s);
assert.deepEqual(
  flow.steps.map((st) => [st.key, st.orders, st.value]),
  [
    ["booked", 13, 1850000],
    ["confirmed", 11, 1589500],
    ["dispatched", 9, 1003500],
    ["delivered", 6, 606000],
    ["kept", 5, 532500],
    ["cash", 3, 347000],
  ],
);
for (let i = 1; i < flow.steps.length; i++) {
  const prev = flow.steps[i - 1];
  const cur = flow.steps[i];
  assert.equal(cur.orders <= prev.orders && cur.value <= prev.value, true, cur.key + " cannot exceed the step before it");
  assert.equal(prev.value - cur.value, sum(cur.drops.map((d) => d.value)), "Drop-offs explain every naira lost before " + cur.key);
  assert.equal(prev.orders - cur.orders, sum(cur.drops.map((d) => d.orders)), "Drop-offs explain every order lost before " + cur.key);
}
for (const st of flow.steps) assert.equal(st.drill.total, st.value, st.key + " drill total matches the figure");
assert.equal(flow.steps.find((x) => x.key === "kept")!.value, computePnl(s).revenue, "Delivered and kept ties to delivered revenue in the P&L");
assert.equal(flow.otherWeeksRevenue, 0);
// moving cash in moves only the last step
const sCash = structuredClone(s);
transition(sCash, 1047, "cash");
transition(sCash, 1050, "cash");
assert.equal(revenueFlow(sCash).steps.find((x) => x.key === "cash")!.value, 532500, "Marking cash received lifts the last step");
// a brand-new empty week is safe (no NaN, no crash)
const sNext = structuredClone(s);
closeCycle(sNext, "chidinma", "2026-11-02T09:00:00Z");
const emptyFlow = revenueFlow(sNext);
assert.equal(emptyFlow.steps[0].orders, 0);
assert.equal(emptyFlow.steps.every((st) => st.share === 0 && Number.isFinite(st.value)), true);

// 25. Leaks: stuck vs costing, each with a drill that adds up; there is deliberately no grand total
const lk = leaks(s);
const by = (k: string) => lk.find((l) => l.key === k)!;
assert.deepEqual(
  lk.map((l) => [l.key, l.kind, Math.round(l.amount)]),
  [
    ["cash", "stuck", 185500],
    ["blocked", "stuck", 187000],
    ["returns", "costing", 7000],
    ["ads", "costing", 261000],
    ["payEarly", "costing", 0],
    ["payKept", "costing", 0],
  ],
);
for (const l of lk) assert.equal(Math.abs(l.drill.total - l.amount) < 1e-6, true, l.key + " drill total matches");
assert.equal(by("cash").amount, cashWithCourier(s).total, "Cash leak is the same figure as the courier tile");
assert.equal(by("returns").amount, 2 * DELIVERY_FEE, "#1046 cost two delivery fees");
assert.equal(by("ads").amount, 185000 - 2 * 4000 + (96000 - 3 * 4000), "Ad leak is spend above max × delivered orders");
const sFix = structuredClone(s);
sFix.maxCostPerOrder = 100000;
assert.equal(leaks(sFix).find((l) => l.key === "ads")!.amount, 0, "A higher max clears the ad leak");
sFix.products.find((p) => p.sku === "VAC-21")!.onHand = 10;
assert.equal(leaks(sFix).find((l) => l.key === "blocked")!.amount, 0, "Stock arriving clears the blocked orders");
const sLead2 = structuredClone(s);
sLead2.rules.creditOn = "lead";
assert.equal(Math.round(leaks(sLead2).find((l) => l.key === "payEarly")!.amount), 34210, "Pay before delivery shows up under the Lead rule");

console.log("ALL 25 ENGINE INVARIANTS PASSED.");

