import assert from "node:assert/strict";
import { buildSeed } from "../lib/seed.ts";
import { TEMPLATES, importData, isoWeekNumber, parseCsv } from "../lib/importer.ts";
import { L, PNL_TEXT, RULE_TEXT, PAY_LINE_TEXT } from "../lib/labels.ts";
import { RULE_DEFS } from "../lib/rules.ts";
import { buildDeepLink, isEmptyLink, parseDeepLink } from "../lib/deeplink.ts";
import {
  actionsFor,
  cloneState,
  markPaid,
  lockCycle,
  adCost,
  PERSONA,
  canApprove,
  canRecordCash,
  canSettle,
  cashDesk,
  cashGap,
  canSeeAllPayouts,
  canSeeCompanyReports,
  canSeeFullAudit,
  canSeeRules,
  ordersFor,
  cashWithCourier,
  payoutQueue,
  salesPeople,
  impactFor,
  impactIsEmpty,
  impactOf,
  leadFunnel,
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
assert.equal(Math.round(pnlCommOnly.commission), 34613, "Commission in W44 should be ₦34,613");
assert.equal(pnlCommOnly.adSpend, 90000, "Ad spend in W44 should be ₦90,000");
assert.equal(pnlCommOnly.actual > 0, true, "The demo week is healthy: profitable even after real costs");

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

// 14. Courier legs: 5 delivered + #1046 return leg + #1046 outbound + #1048 failed attempt = 8. Dispatched-not-delivered orders are not charged yet.
assert.equal(computePnl(s).logistics, 8 * DELIVERY_FEE, "W44 courier fees should be 8 legs × ₦3,500");

// 15. Commission paid on orders that have not landed: none under Delivery, ₦32,189 under Lead
assert.equal(paidOnUndelivered(s).total, 0, "No pre-delivery payout under the Delivery trigger");
const sLead = structuredClone(s);
sLead.rules.creditOn = "lead";
assert.equal(Math.round(paidOnUndelivered(sLead).total), 32189, "Paid on undelivered under Lead should be ₦32,189");

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
  L.headline, L.headlineNet(true), L.headlineNet(false),
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
assert.equal(`${L.payTakenBack}|${L.refunds}`, "Customer refunded|Refunds", "The rule name and the P&L refund line stay separate terms");

// 17. Profit per order = (revenue − product cost − ad spend) ÷ delivered orders, before and after staff pay
const ppo = profitPerOrder(s);
assert.equal(ppo.orders, 5, "W44 has 5 delivered orders");
assert.equal(ppo.before, (532500 - 222500 - 90000) / 5, "Profit per order before staff pay should be +₦44,000");
assert.equal(ppo.after, ppo.before - (computePnl(s).commission + computePnl(s).base) / 5, "After staff pay subtracts commission and fixed salary per order");
assert.equal(Math.round(ppo.after), 12616);
assert.equal(Math.abs(ppo.beforeDrill.total - ppo.before) < 1e-6 && Math.abs(ppo.afterDrill.total - ppo.after) < 1e-6, true, "Drill totals match the figures");

// 18. Any media buyer can run any campaign; max cost per order is a flag and never moves pay
assert.equal(s.maxCostPerOrder, 4000, "Default max cost per order is ₦4,000");
assert.equal(s.orders.some((o) => o.campaign !== undefined), false, "No fixed campaign labels on seed orders");
const tobiCost = adCost(s, "tobi");
const zainabCost = adCost(s, "zainab");
assert.equal(tobiCost.costPerOrder, 55000 / 2);
assert.equal(zainabCost.costPerOrder, 35000 / 3);
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
  assert.equal(has(4, "closer"), false, "A closer not in the demo team is created, not rejected");
  assert.equal(has(5, "price"), true, "Non-numeric price");
}
const own = importData({ orders: HDR + "1,2026-10-20,A,Lagos,AIR-12,1,212000,delivered,Funmi Bello,\n2,2026-10-21,B,Lagos,AIR-12,1,212000,delivered,funmi bello,\n" });
assert.equal(own.ok, true, "Own closer names import without renaming");
if (own.ok) {
  const mine = own.state.people.filter((p) => p.role === "closer" && p.id.startsWith("imp-"));
  assert.equal(mine.length, 1, "Same name in any case is one closer");
  assert.equal(own.state.orders.every((o) => o.closer === mine[0].id), true, "Orders are credited to the created closer");
  assert.equal(own.state.people.filter((p) => p.id === "amaka" || p.id === "chidi").every((p) => p.monthlyBase === 0), true, "Unused demo closers carry no salary");
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
    ["confirmed", 12, 1663000],
    ["dispatched", 10, 1077000],
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
    ["returns", "costing", 10500],
    ["ads", "costing", 70000],
    ["payEarly", "costing", 0],
    ["payKept", "costing", 0],
    ["lostLeads", "costing", 1707696],
  ],
);
{
  const lf = leadFunnel(s);
  assert.deepEqual([lf.leads, lf.booked, lf.lost, lf.open], [29, 13, 12, 4], "W44 Leads: 29 in, 13 booked, 12 lost, 4 not reached");
  assert.equal(Math.round(lf.rate * 100), 45, "45% of Leads became orders");
  assert.equal(lf.bySource.reduce((a, r) => a + r.leads, 0), 29, "Every enquiry has a source");
  assert.equal(lf.lostValue, lf.lost * lf.avgOrder, "Lost Leads are priced at the average order");
  const ids = new Set(s.orders.map((o) => o.id));
  assert.equal(s.leads.filter((l) => l.status === "booked").every((l) => l.orderId !== undefined && ids.has(l.orderId)), true, "Booked Leads point at real orders");
  const imp = importData({ orders: HDR + "1,2026-10-20,A,Lagos,AIR-12,1,212000,delivered,amaka,\n" });
  assert.equal(imp.ok && imp.state.leads.length === 0 && !leaks(imp.state).some((l) => l.key === "lostLeads"), true, "Imported data has no Leads, so no lost-Leads row");
  assert.equal(computePnl(s).actual, computePnl({ ...s, leads: [] }).actual, "Leads never change the money");
}
for (const l of lk) assert.equal(Math.abs(l.drill.total - l.amount) < 1e-6, true, l.key + " drill total matches");
assert.equal(by("cash").amount, cashWithCourier(s).total, "Cash leak is the same figure as the courier tile");
assert.equal(by("returns").amount, 3 * DELIVERY_FEE, "#1046 cost two delivery fees and #1048 one failed attempt");
assert.equal(by("ads").amount, 55000 - 2 * 4000 + (35000 - 3 * 4000), "Ad leak is spend above max × delivered orders");
const sFix = structuredClone(s);
sFix.maxCostPerOrder = 100000;
assert.equal(leaks(sFix).find((l) => l.key === "ads")!.amount, 0, "A higher max clears the ad leak");
sFix.products.find((p) => p.sku === "VAC-21")!.onHand = 10;
assert.equal(leaks(sFix).find((l) => l.key === "blocked")!.amount, 0, "Stock arriving clears the blocked orders");
const sLead2 = structuredClone(s);
sLead2.rules.creditOn = "lead";
assert.equal(Math.round(leaks(sLead2).find((l) => l.key === "payEarly")!.amount), 32189, "Pay before delivery shows up under the Lead rule");

// 26. Live activity: an event's impact is the engine's own before/after difference, shown per role
const deliveredAfter = structuredClone(s);
assert.equal(transition(deliveredAfter, 1043, "deliver"), null);
const imp1043 = impactOf(s, deliveredAfter);
const payOf = (i: typeof imp1043, id: string) => i.pay.find((p) => p.personId === id)?.amount;
assert.equal(payOf(imp1043, "amaka"), 212000 * 0.04, "Closer earns 4% when #1043 lands");
assert.equal(payOf(imp1043, "tobi"), 212000 * 0.015, "Media buyer earns 1.5%");
assert.equal(payOf(imp1043, "ngozi"), 212000 * 0.01, "Team lead earns 1%");
assert.equal(
  Math.abs(sum(imp1043.pay.map((p) => p.amount)) - (computePnl(deliveredAfter).payout - computePnl(s).payout)) < 1e-6,
  true,
  "The pay deltas add up to the change in total staff pay",
);
assert.equal(imp1043.revenue, 212000, "Delivered revenue rises by the order value");
assert.equal(imp1043.profit, 212000 - 78000 - 13780 - DELIVERY_FEE, "Real profit moves by revenue − product cost − commission − delivery fee");
assert.equal(imp1043.stuckCash, 212000, "Delivered but cash not yet in: cash with the courier rises");
assert.deepEqual(imp1043.stock, [{ sku: "AIR-12", onHand: [4, 3], available: [2, 2] }], "On hand drops, free stock is unchanged because the unit was already reserved");

const confirmed = structuredClone(s);
assert.equal(transition(confirmed, 1048, "confirm"), null);
const impConfirm = impactOf(s, confirmed);
assert.deepEqual(impConfirm.stock, [{ sku: "BLN-07", onHand: [12, 12], available: [11, 10] }], "Confirming reserves a unit: free stock drops, on hand does not");
assert.equal(impConfirm.pay.length === 0 && impConfirm.revenue === undefined, true, "Confirming moves no money under the Delivery rule");

const cashed = structuredClone(deliveredAfter);
assert.equal(transition(cashed, 1043, "cash"), null);
assert.equal(impactOf(deliveredAfter, cashed).stuckCash, -212000, "Cash received clears the cash with the courier");

assert.equal(impactIsEmpty(impactOf(s, structuredClone(s))), true, "No change, no impact");

// who sees what
const seen = (role: Parameters<typeof impactFor>[2]) => impactFor(s, imp1043, role);
assert.deepEqual(seen("founder").pay.map((p) => p.personId).sort(), ["amaka", "ngozi", "tobi"]);
assert.equal(seen("founder").profit !== undefined && seen("founder").stuckCash !== undefined, true, "Founder sees company profit and stuck cash");
assert.deepEqual(seen("closer").pay.map((p) => p.personId), ["amaka"], "A closer sees only their own pay");
assert.deepEqual(seen("buyer").pay.map((p) => p.personId), ["tobi"], "A media buyer sees only their own pay");
assert.deepEqual(seen("lead").pay.map((p) => p.personId).sort(), ["amaka", "ngozi"], "The team lead sees themself and their own closers, not the media buyer");
assert.deepEqual(seen("stock").pay, [], "The warehouse sees no pay");
for (const role of ["lead", "closer", "buyer", "stock"] as const) {
  const i = seen(role);
  assert.equal(i.revenue === undefined && i.profit === undefined && i.stuckCash === undefined, true, role + " does not see company revenue, profit or courier cash");
  assert.equal(i.stock.length, 1, role + " still sees the stock move");
}
// a rule change shows up as an impact too
const ruleAfter = structuredClone(s);
ruleAfter.rules.creditOn = "lead";
const ruleImpact = impactOf(s, ruleAfter);
assert.equal(ruleImpact.pay.length > 0 && ruleImpact.profit !== undefined && ruleImpact.profit < 0, true, "Switching to pay on lead raises pay and lowers profit");

// 27. Accountant persona: segregation of duties around money, cash desk and payout queue
const acct = s.people.find((p) => p.id === "bisi")!;
assert.equal(acct.role, "accountant");
assert.equal(PERSONA.accountant, "bisi");
assert.equal(salesPeople(s).some((p) => p.id === "bisi"), false, "The accountant is not on the sales payroll");
const roles = ["founder", "closer", "buyer", "lead", "accountant", "stock"] as const;
const truth = (fn: (r: (typeof roles)[number]) => boolean) => roles.filter(fn);
assert.deepEqual(truth(canEditRules), ["founder"], "Only the founder edits rules");
assert.deepEqual(truth(canApprove), ["founder"], "Only the founder approves (closes) the week's pay");
assert.deepEqual(truth(canSettle), ["founder", "accountant"], "The founder and accountant pay, lock and export the bank file");
assert.deepEqual(truth(canRecordCash), ["founder", "accountant"], "Courier cash is recorded by the founder or accountant, never the warehouse");
for (const o of s.orders) {
  const acc = actionsFor(s, "accountant", o) as string[];
  const owed = o.stage === "delivered" && !o.cashIn;
  assert.deepEqual(acc, owed ? ["cash"] : [], "The accountant can only record cash, and only on delivered orders still owed (#" + o.id + ")");
  assert.equal((actionsFor(s, "stock", o) as string[]).includes("cash"), false, "The warehouse cannot record cash (#" + o.id + ")");
  for (const role of ["closer", "buyer", "lead"] as const) assert.equal((actionsFor(s, role, o) as string[]).includes("cash"), false);
  assert.equal((actionsFor(s, "founder", o) as string[]).includes("cash"), owed, "The founder can record cash when it is owed");
}

// the spec matrix and the engine agree: returns are processed by the warehouse and the founder only
for (const o of s.orders.filter((x) => x.stage === "delivered")) {
  const who = roles.filter((r) => (actionsFor(s, r, o) as string[]).includes("return"));
  assert.deepEqual(who, ["founder", "stock"], "Only the founder and warehouse process returns (#" + o.id + ")");
}

const cd = cashDesk(s);
assert.equal(cd.total, cashWithCourier(s).total, "Cash desk ties to the courier-cash figure");
{
  const g = cashGap(s);
  assert.equal(g.earned, g.received + g.gap, "Cash earned = received + still with couriers");
  assert.equal(g.earned, computePnl(s).revenue, "Cash earned is the P&L delivered revenue");
  assert.equal(g.gapDrill.total, g.gap, "Gap drill ties to the gap");
}
assert.deepEqual(cd.outstanding.map((o) => o.id), [1047, 1050]);
assert.equal(cd.oldestWeeks, 0);
assert.deepEqual(
  cd.rows.map((r) => [r.cycleId, r.delivered, r.received, r.outstanding]),
  [
    ["W42", 417500, 417500, 0],
    ["W43", 487500, 487500, 0],
    ["W44", 532500, 347000, 185500],
  ],
);
assert.equal(sum(cd.rows.map((r) => r.outstanding)), cd.total, "By-week rows add up to the total owed");
assert.equal(sum(cd.byCity.map((c) => c.amount)), cd.total, "By-city rows add up to the total owed");
const aged = structuredClone(s);
aged.orders.find((o) => o.id === 1047)!.deliveredCycle = "W43";
assert.equal(cashDesk(aged).oldestWeeks, 1, "Cash owed from last week is one week old");
const settled = structuredClone(s);
for (const o of cd.outstanding) transition(settled, o.id, "cash");
assert.equal(cashDesk(settled).total, 0, "Recording the cash clears the desk");
assert.equal(leaks(settled).find((l) => l.key === "cash")!.amount, 0, "…and the stuck-cash leak");

const q0 = payoutQueue(s);
assert.deepEqual(q0.awaitingPayment, []);
assert.deepEqual(q0.readyToLock.map((x) => x.cycleId), ["W43"]);
assert.deepEqual(q0.next, { kind: "lock", cycleId: "W43" });
const closedW44 = structuredClone(s);
closeCycle(closedW44, "chidinma", "2026-11-02T09:00:00Z");
const q1 = payoutQueue(closedW44);
assert.deepEqual(q1.awaitingPayment.map((x) => x.cycleId), ["W44"], "After the founder approves, the accountant has a payment to make");
assert.deepEqual(q1.next, { kind: "pay", cycleId: "W44" });
assert.equal(Math.round(q1.awaitingPayment[0].payable), Math.round(sum(salesPeople(s).map((p) => payslip(openLines(s), p.id).payable))), "Awaiting payment equals the payable total");

const acctSees = impactFor(s, imp1043, "accountant");
assert.equal(acctSees.pay.length, 3, "The accountant sees every pay line");
assert.equal(acctSees.revenue !== undefined && acctSees.profit !== undefined && acctSees.stuckCash !== undefined, true, "…and the company figures");
assert.equal(acctSees.stock.length, 0, "…but not stock");

// 28. Shared links: only real personas and real rule options are accepted, and a built link parses back to the same rules.
const dl = parseDeepLink("?role=closer&creditOn=lead&onReturn=nonsense&returnCap=0.3&split=half&role2=x");
assert.equal(dl.role, "closer");
assert.deepEqual(dl.rules, { creditOn: "lead", returnCap: 0.3, split: "half" }, "Unknown values are ignored, known ones kept");
assert.equal(parseDeepLink("?role=admin").role, undefined, "An unknown persona is ignored");
assert.equal(isEmptyLink(parseDeepLink("")), true);
const seedRules = buildSeed().rules;
const custom = { ...seedRules, creditOn: "lead" as const, returnCap: 0.2 };
const built = buildDeepLink("https://x.test/", "founder", custom, seedRules);
assert.equal(built, "https://x.test/?role=founder&creditOn=lead&returnCap=0.2", "Only rules that differ from the demo default are in the link");
assert.deepEqual(parseDeepLink(built.slice(built.indexOf("?"))).rules, { creditOn: "lead", returnCap: 0.2 }, "A built link round-trips");

// 29. cloneState is a safe copy: no engine mutator may touch the state it was cloned from (the store relies on this to skip a 200 ms deep clone).
{
  const base = buildSeed();
  const frozen = structuredClone(base);
  const AT = "2026-11-02T09:00:00Z";
  const probe = (label: string, fn: (c: typeof base) => unknown) => {
    const c = cloneState(base);
    fn(c);
    assert.deepEqual(base, frozen, `${label} changed the state it was cloned from`);
    assert.notEqual(c.orders, base.orders, "a clone has its own orders");
  };
  probe("deliver", (c) => transition(c, 1043, "deliver"));
  probe("return a paid-week order", (c) => transition(c, 1033, "return", { condition: "damaged" }));
  probe("cancel", (c) => transition(c, 1045, "cancel"));
  probe("cash", (c) => transition(c, 1047, "cash"));
  probe("confirm", (c) => transition(c, 1051, "confirm"));
  probe("rule change", (c) => { c.rules.creditOn = "lead"; c.rulesMeta.creditOn = { by: "chidinma", at: AT }; });
  probe("close, pay and lock a week", (c) => { closeCycle(c, "chidinma", AT); markPaid(c, "W44", "bisi", AT); lockCycle(c, "W44", "bisi", AT); });
  probe("raise and receive a PO", (c) => { raisePO(c, "VAC-21", 10, "dayo", AT); receivePO(c, c.pos[0].id, AT); });
  probe("price change", (c) => setProductPrice(c, "AIR-12", 150000));
  probe("new order", (c) => createOrder(c, { customer: "Test", city: "Lagos", sku: "KET-03", qty: 1, openedBy: "amaka", closer: "amaka", buyer: "tobi" }));
  const cl = cloneState(base);
  assert.deepEqual(cl, base, "a fresh clone equals the original");
}


// 30. Separation of concerns: who sees the pay rules, everyone's payouts, the full audit log and which orders
for (const r of ["founder", "accountant"] as const) {
  assert.equal(canSeeRules(r) && canSeeAllPayouts(r) && canSeeFullAudit(r), true, r + " sees rules, all payouts and the full audit log");
}
for (const r of ["closer", "buyer", "lead", "stock"] as const) {
  assert.equal(canSeeRules(r) || canSeeAllPayouts(r) || canSeeFullAudit(r), false, r + " sees none of rules, all payouts or the full audit log");
}
assert.equal(canSeeCompanyReports("founder"), true);
assert.equal(canSeeCompanyReports("accountant") || canSeeCompanyReports("buyer"), false, "Company reports are founder only");
assert.equal(ordersFor(s, "buyer").every((o) => o.buyer === "tobi"), true, "A media buyer only gets orders their ads generated");
assert.equal(ordersFor(s, "buyer").length > 0 && ordersFor(s, "buyer").length < s.orders.length, true, "...and not all of them");
assert.equal(ordersFor(s, "closer").every((o) => o.closer === "amaka" || o.openedBy === "amaka"), true, "A closer only gets their own orders");
assert.equal(ordersFor(s, "founder").length, s.orders.length, "The founder sees every order");
assert.equal(ordersFor(s, "stock").length, s.orders.length, "The warehouse sees every order");

console.log("ALL 30 ENGINE INVARIANTS PASSED.");

