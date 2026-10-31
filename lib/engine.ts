// Pure calculation layer. No React, no storage: every figure on screen comes from here,
// which is what makes each one drillable back to the orders behind it.

import { L } from "./labels.ts";
import type {
  AuditEntry,
  CreditOn,
  Cycle,
  DemoState,
  Drill,
  DrillLine,
  Impact,
  Order,
  PayLine,
  Person,
  PnL,
  Product,
  Role,
  Rules,
} from "./types.ts";

/* ------------------------------------------------------------------ constants */

export const DELIVERY_FEE = 3500; // per courier leg, outbound or return

/** Rates depend on the trigger. Paying on a lead is cheaper per order, because it is
 *  paid on every order — including the ones that never land. */
export const RATES: Record<CreditOn, { closer: number; buyer: number; lead: number }> = {
  delivered: { closer: 0.04, buyer: 0.015, lead: 0.01 },
  cash: { closer: 0.04, buyer: 0.015, lead: 0.01 },
  lead: { closer: 0.015, buyer: 0.0075, lead: 0.005 },
};
export const totalRate = (c: CreditOn) => RATES[c].closer + RATES[c].buyer + RATES[c].lead;

export const TARGETS = {
  commissionRatio: 0.1,
  payoutRatio: { commission: 0.1, base_plus: 0.35 },
};

export const SALES_ROLES: Role[] = ["closer", "buyer", "lead"];
export const PERSONA: Record<Role, string> = {
  closer: "amaka",
  buyer: "tobi",
  lead: "ngozi",
  stock: "dayo",
  founder: "chidinma",
  accountant: "bisi",
};
/** Ad spend is a demo figure, never a live Meta connection. */
export const SIM_FEED_NOTE = "Simulated Meta feed (demo figures, not a live connection)";

/* ------------------------------------------------------------------ lookups */

export const orderValue = (o: Order) => o.unitPrice * o.qty;
export const personOf = (s: DemoState, id: string): Person =>
  s.people.find((p) => p.id === id) ?? { id, name: id, role: "closer", title: "", monthlyBase: 0 };
export const firstName = (s: DemoState, id: string) => personOf(s, id).name.split(" ")[0];
export const productOf = (s: DemoState, sku: string): Product => s.products.find((p) => p.sku === sku)!;
export const openCycle = (s: DemoState): Cycle => s.cycles.find((c) => c.status === "open")!;
export const cycleById = (s: DemoState, id: string) => s.cycles.find((c) => c.id === id);
export const salesPeople = (s: DemoState) => s.people.filter((p) => SALES_ROLES.includes(p.role));
export const weeklyBase = (p: Person) => Math.round((p.monthlyBase * 12) / 52);
export const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const pctTxt = (n: number) => (n * 100).toFixed(n * 100 < 1 ? 2 : 1).replace(/\.0+$/, "") + "%";

/* ------------------------------------------------------------------ crediting */

export function isCredited(o: Order, rules: Rules): boolean {
  if (o.stage === "returned" || o.stage === "cancelled") {
    if (rules.creditOn === "lead") return rules.onReturn === "absorb";
    // A delivery-triggered order only earned anything if it actually landed.
    if (o.stage !== "returned" || rules.onReturn !== "absorb") return false;
    return rules.creditOn === "delivered" || o.cashIn;
  }
  if (rules.creditOn === "lead") return true;
  if (rules.creditOn === "delivered") return o.stage === "delivered";
  return o.stage === "delivered" && o.cashIn;
}

export function closerReturnRate(s: DemoState, personId: string): number {
  const mine = s.orders.filter((o) => o.closer === personId);
  const delivered = mine.filter((o) => o.stage === "delivered").length;
  const returned = mine.filter((o) => o.stage === "returned").length;
  const resolved = delivered + returned;
  return resolved ? returned / resolved : 0;
}

export function returnCapBreached(s: DemoState, personId: string, rules: Rules = s.rules): boolean {
  const cap = rules.returnCap ?? 1;
  return cap < 1 && closerReturnRate(s, personId) > cap + 1e-9;
}

export function commissionLines(s: DemoState, o: Order, rules: Rules, cycleId: string): PayLine[] {
  const v = orderValue(o);
  const r = RATES[rules.creditOn];
  const out: PayLine[] = [];
  const closerRate = r.closer;
  const pool = v * closerRate;
  const addCloser = (personId: string, share: number, label: string) => {
    const capHit = returnCapBreached(s, personId, rules);
    const amt = share * (capHit ? 0.5 : 1);
    const capNote = capHit
      ? ` · halved: ${Math.round(closerReturnRate(s, personId) * 100)}% return rate exceeds ${Math.round((rules.returnCap ?? 1) * 100)}% quality gate`
      : "";
    out.push({
      key: `${cycleId}-${o.id}-${personId}-commission-${out.length}`,
      personId,
      kind: "commission",
      orderId: o.id,
      amount: amt,
      note: `${label}${capNote}`,
    });
  };
  const add = (personId: string, kind: PayLine["kind"], amount: number, note: string) =>
    out.push({ key: `${cycleId}-${o.id}-${personId}-${kind}-${out.length}`, personId, kind, orderId: o.id, amount, note });

  if (o.openedBy !== o.closer) {
    const opener = firstName(s, o.openedBy);
    const closer = firstName(s, o.closer);
    if (rules.split === "first") addCloser(o.openedBy, pool, `Closer ${pctTxt(closerRate)} · first touch: ${opener} opened it`);
    else if (rules.split === "last") addCloser(o.closer, pool, `Closer ${pctTxt(closerRate)} · last touch: ${closer} closed it`);
    else {
      addCloser(o.openedBy, pool / 2, `Closer ${pctTxt(closerRate)} · 50-50 split, opened`);
      addCloser(o.closer, pool / 2, `Closer ${pctTxt(closerRate)} · 50-50 split, closed`);
    }
  } else {
    addCloser(o.closer, pool, `Closer ${pctTxt(closerRate)}`);
  }
  add(o.buyer, "commission", v * r.buyer, `Media buyer ${pctTxt(r.buyer)}${o.campaign ? ` · ${o.campaign}` : ""}`);
  const lead = personOf(s, o.closer).reportsTo;
  if (lead) add(lead, "commission", v * r.lead, `${L.teamBonus} ${pctTxt(r.lead)}`);
  return out;
}

export interface Reversals {
  clawbacks: PayLine[];
  deferred: PayLine[];
  absorbed: { order: Order; amount: number; reason: string }[];
}

/** Credited orders that came back in the open cycle. In-cycle returns of uncredited
 *  orders simply never accrue; this handles the hard case — money already went out. */
export function reversals(s: DemoState, rules: Rules): Reversals {
  const c = openCycle(s);
  const res: Reversals = { clawbacks: [], deferred: [], absorbed: [] };
  for (const o of s.orders) {
    if (o.reversedCycle !== c.id) continue;
    if (o.stage !== "returned" && o.stage !== "cancelled") continue;
    // Same-cycle return that stayed credited under "absorb".
    if (!o.creditedCycle) {
      if (!o.closedOut && isCredited(o, rules)) {
        const amt = sum(commissionLines(s, o, rules, c.id).map((l) => l.amount));
        res.absorbed.push({ order: o, amount: amt, reason: "Returned this week · the business absorbs it" });
      }
      continue;
    }
    const pc = cycleById(s, o.creditedCycle);
    if (!pc) continue;
    const paid = (pc.lines ?? []).filter((l) => l.orderId === o.id && l.kind === "commission");
    const total = sum(paid.map((l) => l.amount));
    if (pc.status === "locked") {
      res.absorbed.push({ order: o, amount: total, reason: `${pc.id} is locked · return window closed` });
    } else if (rules.onReturn === "clawback") {
      paid.forEach((l, i) =>
        res.clawbacks.push({
          key: `${c.id}-claw-${o.id}-${i}`,
          personId: l.personId,
          kind: "clawback",
          orderId: o.id,
          amount: -l.amount,
          note: `${L.payTakenBack} · order ${o.id} came back after ${pc.id} was ${pc.status}`,
        }),
      );
    } else if (rules.onReturn === "offset") {
      paid.forEach((l, i) =>
        res.deferred.push({
          key: `${c.id}-off-${o.id}-${i}`,
          personId: l.personId,
          kind: "offset",
          orderId: o.id,
          amount: -l.amount,
          note: `${L.payTakenBack} next week · order ${o.id} came back after ${pc.id} was ${pc.status}`,
        }),
      );
    } else {
      res.absorbed.push({ order: o, amount: total, reason: `Paid in ${pc.id} · business absorbs it` });
    }
  }
  return res;
}

export function openLines(s: DemoState, rules: Rules = s.rules): PayLine[] {
  const c = openCycle(s);
  const lines: PayLine[] = [...c.carryIn];
  if (rules.payModel === "base_plus") {
    for (const p of salesPeople(s)) {
      lines.push({ key: `${c.id}-base-${p.id}`, personId: p.id, kind: "base", amount: weeklyBase(p), note: "Fixed salary, one week's share" });
    }
  }
  for (const o of s.orders) {
    if (o.creditedCycle || o.closedOut || !isCredited(o, rules)) continue;
    lines.push(...commissionLines(s, o, rules, c.id));
  }
  lines.push(...reversals(s, rules).clawbacks);
  return lines;
}

export function cycleLines(s: DemoState, cycleId?: string, rules: Rules = s.rules): PayLine[] {
  const c = cycleId ? cycleById(s, cycleId) : openCycle(s);
  if (!c) return [];
  return c.status === "open" ? openLines(s, rules) : c.lines ?? [];
}

export interface Payslip {
  personId: string;
  base: number;
  commission: number;
  adjustments: number;
  carry: number;
  gross: number;
  payable: number;
  lines: PayLine[];
}

export function payslip(lines: PayLine[], personId: string): Payslip {
  const mine = lines.filter((l) => l.personId === personId);
  const by = (k: PayLine["kind"][]) => sum(mine.filter((l) => k.includes(l.kind)).map((l) => l.amount));
  const gross = sum(mine.map((l) => l.amount));
  return {
    personId,
    base: by(["base"]),
    commission: by(["commission"]),
    adjustments: by(["clawback", "offset"]),
    carry: by(["carry"]),
    gross,
    payable: Math.max(0, gross),
    lines: mine,
  };
}

/* ------------------------------------------------------------------ P&L */

const unitCost = (s: DemoState, o: Order) => productOf(s, o.sku).cost * o.qty;
const orderRef = (o: Order) => `#${o.id}`;

export function computePnl(s: DemoState, rules: Rules = s.rules): PnL {
  const c = openCycle(s);
  const C = c.id;
  const lines = openLines(s, rules);

  const revOrders = s.orders.filter((o) => o.deliveredCycle === C && !(o.stage === "returned" && o.reversedCycle === C));
  const refundOrders = s.orders.filter((o) => o.stage === "returned" && o.reversedCycle === C && o.deliveredCycle !== C);
  const writeoffOrders = s.orders.filter(
    (o) => o.stage === "returned" && o.reversedCycle === C && o.deliveredCycle === C && o.returnCondition === "damaged",
  );

  const revenueL: DrillLine[] = revOrders.map((o) => ({
    ref: orderRef(o),
    label: `${o.customer} · ${o.sku} ×${o.qty}`,
    detail: o.cashIn ? "Cash received" : "Delivered · cash still with courier",
    amount: orderValue(o),
  }));
  const refundL: DrillLine[] = refundOrders.map((o) => ({
    ref: orderRef(o),
    label: `${o.customer} · delivered ${o.deliveredCycle}, returned ${C}`,
    detail: o.returnCondition === "damaged" ? "Damaged, not put back on the shelf" : "Put back on the shelf",
    amount: orderValue(o),
  }));
  const cogsL: DrillLine[] = [
    ...revOrders.map((o) => ({ ref: orderRef(o), label: `${o.sku} ×${o.qty} · ${productOf(s, o.sku).name}`, detail: "Cost per unit × quantity", amount: unitCost(s, o) })),
    ...refundOrders
      .filter((o) => o.returnCondition !== "damaged")
      .map((o) => ({ ref: orderRef(o), label: `${o.sku} ×${o.qty} back on the shelf`, detail: "Returned from an earlier week, back on the shelf", amount: -unitCost(s, o) })),
  ];
  const writeoffL: DrillLine[] = writeoffOrders.map((o) => ({ ref: orderRef(o), label: `${o.sku} ×${o.qty} returned damaged`, detail: "Lost: it cannot be resold", amount: unitCost(s, o) }));

  const commLines = lines.filter((l) => l.kind === "commission" || l.kind === "clawback" || l.kind === "offset");
  const commissionL: DrillLine[] = commLines.map((l) => ({
    ref: l.orderId ? `#${l.orderId}` : l.kind,
    label: `${personOf(s, l.personId).name}`,
    detail: l.note,
    amount: l.amount,
  }));
  const baseL: DrillLine[] = lines
    .filter((l) => l.kind === "base")
    .map((l) => ({ ref: personOf(s, l.personId).title, label: personOf(s, l.personId).name, detail: l.note, amount: l.amount }));

  const spend = s.spend[C] ?? {};
  const spendL: DrillLine[] = Object.entries(spend).map(([id, amt]) => ({
    ref: "Sim. feed",
    label: personOf(s, id).name,
    detail: SIM_FEED_NOTE,
    amount: amt,
  }));

  const logisticsL: DrillLine[] = [];
  for (const o of s.orders) {
    if (o.deliveredCycle === C) logisticsL.push({ ref: orderRef(o), label: `Delivery · ${o.city}`, detail: "Courier fee for the delivery trip", amount: DELIVERY_FEE });
    if (o.failed && o.reversedCycle === C) logisticsL.push({ ref: orderRef(o), label: `Failed attempt · ${o.city}`, detail: "Courier fee for a delivery that failed", amount: DELIVERY_FEE });
    if (o.stage === "returned" && o.reversedCycle === C) logisticsL.push({ ref: orderRef(o), label: `Return trip · ${o.city}`, detail: "Courier fee to bring it back to the warehouse", amount: DELIVERY_FEE });
  }

  const total = (l: DrillLine[]) => sum(l.map((x) => x.amount));
  const revenue = total(revenueL);
  const refunds = total(refundL);
  const cogs = total(cogsL);
  const writeoffs = total(writeoffL);
  const commission = total(commissionL);
  const base = total(baseL);
  const adSpend = total(spendL);
  const logistics = total(logisticsL);
  const actual = revenue - refunds - cogs - writeoffs - commission - base - adSpend - logistics;
  const payout = commission + base;

  const d = (title: string, l: DrillLine[], subtitle?: string): Drill => ({ title, subtitle, lines: l, total: total(l) });
  const actualL: DrillLine[] = [
    { ref: "+", label: "Delivered revenue", amount: revenue },
    { ref: "−", label: L.refunds, amount: -refunds },
    { ref: "−", label: L.productCost, amount: -cogs },
    { ref: "−", label: L.damagedStock, amount: -writeoffs },
    { ref: "−", label: `${L.salesPay} (after pay taken back)`, amount: -commission },
    { ref: "−", label: L.fixedSalary, amount: -base },
    { ref: "−", label: L.adSpend, amount: -adSpend },
    { ref: "−", label: L.deliveryFees, amount: -logistics },
  ].filter((x) => x.amount !== 0 || x.ref === "+");

  return {
    cycleId: C,
    revenue,
    refunds,
    cogs,
    writeoffs,
    commission,
    base,
    adSpend,
    logistics,
    actual,
    payout,
    payoutRatio: revenue > 0 ? payout / revenue : 0,
    commissionRatio: revenue > 0 ? commission / revenue : 0,
    drills: {
      revenue: d(L.revenue, revenueL, `Orders delivered in ${C} and not returned`),
      refunds: d(L.refunds, refundL, "Orders delivered in an earlier week and returned this week"),
      cogs: d(L.productCost, cogsL, "What the goods cost Kova, not what they sold for"),
      writeoffs: d(L.damagedStock, writeoffL, "Returned and can't be resold"),
      commission: d(L.salesPay, commissionL, "Every line, including pay taken back"),
      base: d(L.fixedSalary, baseL, "Fixed salary for sales staff, one week's share"),
      adSpend: d("Ad spend", spendL),
      logistics: d(L.deliveryFees, logisticsL, L.deliveryFeeNote(DELIVERY_FEE)),
      actual: d(`${L.realProfit} this week`, actualL, "What is left after every cost the business carries"),
    },
  };
}

export function pnlFor(s: DemoState, cycleId?: string): PnL | undefined {
  const c = cycleId ? cycleById(s, cycleId) : openCycle(s);
  if (!c) return undefined;
  return c.status === "open" ? computePnl(s) : c.pnl;
}

export function whatIf(s: DemoState, patch: Partial<Rules>) {
  const p = computePnl(s, { ...s.rules, ...patch });
  return { payout: p.payout, commission: p.commission, actual: p.actual };
}

/* ------------------------------------------------------------------ founder extras */

export function cashWithCourier(s: DemoState): Drill {
  const lines = s.orders
    .filter((o) => o.stage === "delivered" && !o.cashIn)
    .map((o) => ({ ref: orderRef(o), label: `${o.customer} · ${o.city}`, detail: `Delivered ${o.deliveredCycle} · the courier has not handed over the cash`, amount: orderValue(o) }));
  return { title: "Cash still with the courier", subtitle: "Delivered, but the courier has not handed over the money", lines, total: sum(lines.map((l) => l.amount)) };
}

export function paidOnUndelivered(s: DemoState): Drill {
  const byId = new Map(s.orders.map((o) => [o.id, o]));
  const lines = openLines(s)
    .filter((l) => l.kind === "commission" && l.orderId)
    .map((l) => ({ l, o: byId.get(l.orderId!)! }))
    .filter(({ o }) => o.stage !== "delivered")
    .map(({ l, o }) => ({ ref: orderRef(o), label: `${personOf(s, l.personId).name}`, detail: `${o.failed ? "Delivery failed" : (L.stage[o.stage] ?? o.stage) + ", not delivered yet"}`, amount: l.amount }));
  return { title: "Commission on orders that have not been delivered", subtitle: "Staff are paid before the customer has received the order", lines, total: sum(lines.map((l) => l.amount)) };
}

export function absorbedDrill(s: DemoState): Drill {
  const r = reversals(s, s.rules);
  const lines = r.absorbed.map((a) => ({ ref: orderRef(a.order), label: a.order.customer, detail: a.reason, amount: a.amount }));
  return { title: L.payKeptOnReturns, subtitle: "Staff keep this pay and the business takes the loss", lines, total: sum(lines.map((l) => l.amount)) };
}

export function deferredDrill(s: DemoState): Drill {
  const r = reversals(s, s.rules);
  const lines = r.deferred.map((l) => ({ ref: `#${l.orderId}`, label: personOf(s, l.personId).name, detail: l.note, amount: l.amount }));
  return { title: L.payTakenBackNextWeek, subtitle: "Taken off next week's payout, not this week's", lines, total: sum(lines.map((l) => l.amount)) };
}

/* ------------------------------------------------------------------ people metrics */

export interface CloserStats {
  personId: string;
  orders: number;
  delivered: number;
  returned: number;
  failed: number;
  returnRate: number;
  capBreached: boolean;
  deliveredValue: number;
  earnedThisCycle: number;
  lifetimeCommission: number;
  /** Net profit generated by this closer's orders in the open cycle after product cost, commission, and delivery fees. */
  netContribution: number;
  contributionDrill: Drill;
}

export function closerStats(s: DemoState, personId: string): CloserStats {
  const c = openCycle(s);
  const mine = s.orders.filter((o) => o.closer === personId);
  const delivered = mine.filter((o) => o.stage === "delivered");
  const returned = mine.filter((o) => o.stage === "returned");
  const failed = mine.filter((o) => o.stage === "cancelled" && o.failed);
  const resolved = delivered.length + returned.length;
  const closedComm = sum(
    s.cycles
      .filter((cy) => cy.status !== "open")
      .flatMap((cy) => cy.lines ?? [])
      .filter((l) => l.personId === personId && l.kind !== "base" && l.kind !== "carry")
      .map((l) => l.amount),
  );
  const lines = openLines(s);
  const open = payslip(lines, personId);

  // Net margin contribution in the open cycle
  const contribLines: DrillLine[] = [];
  for (const o of mine) {
    if (o.deliveredCycle === c.id && !(o.stage === "returned" && o.reversedCycle === c.id)) {
      const gross = orderValue(o) - unitCost(s, o) - DELIVERY_FEE;
      contribLines.push({
        ref: orderRef(o),
        label: `${o.customer} · landed (${o.sku} ×${o.qty})`,
        detail: `Sales ₦${orderValue(o).toLocaleString()} − product cost ₦${unitCost(s, o).toLocaleString()} − delivery ₦${DELIVERY_FEE.toLocaleString()}`,
        amount: gross,
      });
    } else if (o.stage === "returned" && o.reversedCycle === c.id) {
      const dmg = o.returnCondition === "damaged" ? unitCost(s, o) : 0;
      const loss = -(DELIVERY_FEE * 2 + dmg);
      contribLines.push({
        ref: orderRef(o),
        label: `${o.customer} · returned (${o.returnCondition ?? "resellable"})`,
        detail: `2 courier fees wasted${dmg ? ` + ₦${dmg.toLocaleString()} damaged stock` : ""}`,
        amount: loss,
      });
    } else if (o.failed && o.reversedCycle === c.id) {
      contribLines.push({
        ref: orderRef(o),
        label: `${o.customer} · failed delivery`,
        detail: "Courier fee wasted",
        amount: -DELIVERY_FEE,
      });
    }
  }
  const closerCommCost = open.commission + open.adjustments;
  if (closerCommCost !== 0) {
    contribLines.push({
      ref: "COMM",
      label: `${personOf(s, personId).name} · commission this week`,
      detail: "Commission, after any pay taken back",
      amount: -closerCommCost,
    });
  }
  const netContribution = sum(contribLines.map((l) => l.amount));

  return {
    personId,
    orders: mine.length,
    delivered: delivered.length,
    returned: returned.length,
    failed: failed.length,
    returnRate: resolved ? returned.length / resolved : 0,
    capBreached: returnCapBreached(s, personId),
    deliveredValue: sum(delivered.map(orderValue)),
    earnedThisCycle: closerCommCost,
    lifetimeCommission: closedComm + closerCommCost,
    netContribution,
    contributionDrill: {
      title: `${personOf(s, personId).name} · Net Margin Contribution (${c.id})`,
      subtitle: "Delivered profit minus delivery fees lost on returns and failures, and commission",
      lines: contribLines,
      total: netContribution,
    },
  };
}

export interface CampaignStats {
  buyerId: string;
  spend: number;
  bookedRev: number;
  bookedRoas: number;
  deliveredRev: number;
  deliveredRoas: number;
  cogs: number;
  logistics: number;
  commission: number;
  netMargin: number;
  marginDrill: Drill;
}

export function campaignStats(s: DemoState, buyerId: string): CampaignStats {
  const c = openCycle(s);
  const spend = s.spend[c.id]?.[buyerId] ?? 0;
  const ords = s.orders.filter((o) => o.buyer === buyerId && o.createdCycle === c.id);
  const del = ords.filter((o) => o.stage === "delivered");
  const ret = s.orders.filter((o) => o.buyer === buyerId && o.stage === "returned" && o.reversedCycle === c.id);
  const failed = s.orders.filter((o) => o.buyer === buyerId && o.failed && o.reversedCycle === c.id);

  const bookedRev = sum(ords.map(orderValue));
  const deliveredRev = sum(del.map(orderValue));
  const cogs = sum(del.map((o) => unitCost(s, o)));
  const logistics = del.length * DELIVERY_FEE + ret.length * (DELIVERY_FEE * 2) + failed.length * DELIVERY_FEE;
  const lines = openLines(s);
  const comm = sum(
    lines
      .filter((l) => l.orderId && ords.some((o) => o.id === l.orderId) && l.kind === "commission")
      .map((l) => l.amount),
  );
  const netMargin = deliveredRev - cogs - logistics - comm - spend;
  const drillLines: DrillLine[] = [
    { ref: "+", label: "Delivered revenue", detail: `${del.length} landed orders`, amount: deliveredRev },
    { ref: "−", label: L.productCost, detail: "What the delivered items cost", amount: -cogs },
    { ref: "−", label: L.deliveryFees, detail: `${del.length} delivered, ${ret.length} returned, ${failed.length} failed`, amount: -logistics },
    { ref: "−", label: L.salesPay, detail: "Closer + media buyer + team bonus", amount: -comm },
    { ref: "−", label: L.adSpend, detail: SIM_FEED_NOTE, amount: -spend },
  ];

  return {
    buyerId,
    spend,
    bookedRev,
    bookedRoas: spend > 0 ? bookedRev / spend : 0,
    deliveredRev,
    deliveredRoas: spend > 0 ? deliveredRev / spend : 0,
    cogs,
    logistics,
    commission: comm,
    netMargin,
    marginDrill: {
      title: `${personOf(s, buyerId).name} · What is really left from ads (${c.id})`,
      subtitle: `Managed by ${personOf(s, buyerId).name} · sales per ₦1 of ads looks better than it is, because it ignores product cost and returns`,
      lines: drillLines,
      total: netMargin,
    },
  };
}

/* ------------------------------------------------------------------ profit per order & ad cost */

/** Orders that landed in the open cycle and stayed landed. The same set as the revenue line. */
export const deliveredInCycle = (s: DemoState): Order[] => {
  const C = openCycle(s).id;
  return s.orders.filter((o) => o.deliveredCycle === C && !(o.stage === "returned" && o.reversedCycle === C));
};

export interface ProfitPerOrder {
  orders: number;
  /** (revenue − product cost − ad spend) ÷ delivered orders */
  before: number;
  /** The same, after fixed salary and commission */
  after: number;
  beforeDrill: Drill;
  afterDrill: Drill;
}

export function profitPerOrder(s: DemoState, rules: Rules = s.rules): ProfitPerOrder {
  const p = computePnl(s, rules);
  const n = deliveredInCycle(s).length;
  const per = (x: number) => (n > 0 ? x / n : 0);
  const note = (x: number) => `₦${Math.round(x).toLocaleString()} ÷ ${n} delivered order${n === 1 ? "" : "s"}`;
  const baseLines: DrillLine[] = [
    { ref: "+", label: L.revenue, detail: note(p.revenue), amount: per(p.revenue) },
    { ref: "−", label: L.productCost, detail: note(p.cogs), amount: -per(p.cogs) },
    { ref: "−", label: L.adSpend, detail: `${note(p.adSpend)} · ${SIM_FEED_NOTE}`, amount: -per(p.adSpend) },
  ];
  const before = sum(baseLines.map((l) => l.amount));
  const payLines: DrillLine[] = [
    { ref: "−", label: L.salesPay, detail: note(p.commission), amount: -per(p.commission) },
    { ref: "−", label: L.fixedSalary, detail: note(p.base), amount: -per(p.base) },
  ];
  const after = before + sum(payLines.map((l) => l.amount));
  return {
    orders: n,
    before,
    after,
    beforeDrill: { title: L.profitPerOrderBeforePay, subtitle: "Delivery fees are not included", lines: baseLines, total: before },
    afterDrill: { title: L.profitPerOrderAfterPay, subtitle: "Delivery fees are not included", lines: [...baseLines, ...payLines], total: after },
  };
}

export interface AdCost {
  buyerId: string;
  spend: number;
  delivered: number;
  /** null when ads ran but nothing was delivered yet */
  costPerOrder: number | null;
  overMax: boolean;
}

/** Ad spend ÷ delivered orders for one media buyer. Flags against the founder's max; pay is untouched. */
export function adCost(s: DemoState, buyerId: string): AdCost {
  const spend = s.spend[openCycle(s).id]?.[buyerId] ?? 0;
  const delivered = deliveredInCycle(s).filter((o) => o.buyer === buyerId).length;
  const costPerOrder = delivered > 0 ? spend / delivered : null;
  const overMax = spend > 0 && (costPerOrder === null || costPerOrder > s.maxCostPerOrder + 1e-9);
  return { buyerId, spend, delivered, costPerOrder, overMax };
}

/* ------------------------------------------------------------------ revenue flow & leaks */

export type FlowKey = "booked" | "confirmed" | "dispatched" | "delivered" | "kept" | "cash";

export interface FlowDrop {
  label: string;
  orders: number;
  value: number;
}

export interface FlowStep {
  key: FlowKey;
  orders: number;
  value: number;
  /** Share of the booked value that reached this step. */
  share: number;
  /** What fell out between the previous step and this one. */
  drops: FlowDrop[];
  drill: Drill;
}

export interface RevenueFlow {
  cycleId: string;
  steps: FlowStep[];
  /** P&L delivered revenue minus the "kept" step: revenue from orders booked in earlier weeks. */
  otherWeeksRevenue: number;
}

const failedCancel = (o: Order) => o.stage === "cancelled" && Boolean(o.failed);

/** Where every order booked this week has got to, with the money at each step.
 *  Each step is "reached this stage or beyond", so a step can only be smaller than the one before it. */
export function revenueFlow(s: DemoState): RevenueFlow {
  const C = openCycle(s).id;
  const mine = s.orders.filter((o) => o.createdCycle === C);
  const value = (os: Order[]) => sum(os.map(orderValue));
  const reach: Record<FlowKey, (o: Order) => boolean> = {
    booked: () => true,
    confirmed: (o) => ["confirmed", "dispatched", "delivered", "returned"].includes(o.stage) || failedCancel(o),
    dispatched: (o) => ["dispatched", "delivered", "returned"].includes(o.stage) || failedCancel(o),
    delivered: (o) => o.stage === "delivered" || o.stage === "returned",
    kept: (o) => o.stage === "delivered",
    cash: (o) => o.stage === "delivered" && o.cashIn,
  };
  const dropsFor: Record<FlowKey, [string, (o: Order) => boolean][]> = {
    booked: [],
    confirmed: [
      [L.flowDropWaitingConfirm, (o) => o.stage === "new"],
      [L.flowDropCancelled, (o) => o.stage === "cancelled" && !o.failed],
    ],
    dispatched: [[L.flowDropWaitingDispatch, (o) => o.stage === "confirmed"]],
    delivered: [
      [L.flowDropOnTheRoad, (o) => o.stage === "dispatched"],
      [L.flowDropFailed, failedCancel],
    ],
    kept: [[L.flowDropReturned, (o) => o.stage === "returned"]],
    cash: [[L.flowDropCashWithCourier, (o) => o.stage === "delivered" && !o.cashIn]],
  };
  const stageNote = (o: Order) => (failedCancel(o) ? "Failed delivery" : o.stage === "delivered" && !o.cashIn ? "Delivered · cash still with courier" : L.stage[o.stage] ?? o.stage);

  const bookedValue = value(mine);
  const keys = Object.keys(reach) as FlowKey[];
  const steps: FlowStep[] = keys.map((key) => {
    const at = mine.filter(reach[key]);
    const v = value(at);
    return {
      key,
      orders: at.length,
      value: v,
      share: bookedValue > 0 ? v / bookedValue : 0,
      drops: dropsFor[key]
        .map(([label, test]) => {
          const hit = mine.filter(test);
          return { label, orders: hit.length, value: value(hit) };
        })
        .filter((d) => d.orders > 0),
      drill: {
        title: L.flowStepLabel[key],
        subtitle: `Orders booked in ${C} that have ${L.flowStepHint[key]}`,
        lines: at.map((o) => ({ ref: orderRef(o), label: `${o.customer} · ${o.sku} ×${o.qty}`, detail: stageNote(o), amount: orderValue(o) })),
        total: v,
      },
    };
  });
  const kept = steps.find((x) => x.key === "kept")!;
  return { cycleId: C, steps, otherWeeksRevenue: computePnl(s).revenue - kept.value };
}

export type LeakKind = "stuck" | "costing";

export interface Leak {
  key: "cash" | "blocked" | "returns" | "ads" | "payEarly" | "payKept";
  kind: LeakKind;
  /** Money. Zero means this leak is clear. */
  amount: number;
  count: number;
  drill: Drill;
}

/** Money that is stuck on its way in, or that is costing you. Not additive to the P&L:
 *  each row is a different lens on the same week, so there is deliberately no grand total. */
export function leaks(s: DemoState): Leak[] {
  const C = openCycle(s).id;
  const make = (key: Leak["key"], kind: LeakKind, title: string, subtitle: string, lines: DrillLine[]): Leak => ({
    key,
    kind,
    amount: sum(lines.map((l) => l.amount)),
    count: lines.length,
    drill: { title, subtitle, lines, total: sum(lines.map((l) => l.amount)) },
  });

  const cash = cashWithCourier(s);
  const cashLeak = make("cash", "stuck", L.leak.cash.label, cash.subtitle ?? "", cash.lines);

  const rowBySku = new Map(stockRows(s).map((r) => [r.product.sku, r]));
  const blockedLines: DrillLine[] = s.orders
    .filter((o) => o.stage === "new")
    .map((o) => ({ o, row: rowBySku.get(o.sku) ?? stockRow(s, productOf(s, o.sku)) }))
    .filter(({ o, row }) => row.available < o.qty)
    .map(({ o, row }) => ({
      ref: orderRef(o),
      label: `${o.customer} · ${o.sku} ×${o.qty}`,
      detail: `${Math.max(0, row.available)} in stock, the order needs ${o.qty}${row.onOrder > 0 ? ` · ${row.onOrder} on order, due ${row.nextEta}` : " · no purchase order raised yet"}`,
      amount: orderValue(o),
    }));
  const blockedLeak = make("blocked", "stuck", L.leak.blocked.label, "New orders that cannot be confirmed because the stock is not there", blockedLines);

  const returnLines: DrillLine[] = [];
  for (const o of s.orders) {
    if (o.reversedCycle !== C) continue;
    const trips = (o.deliveredCycle === C && o.stage === "returned" ? 1 : 0) + (o.stage === "returned" ? 1 : 0) + (failedCancel(o) ? 1 : 0);
    if (trips > 0) {
      returnLines.push({
        ref: orderRef(o),
        label: `${o.customer} · ${o.stage === "returned" ? "returned" : "failed delivery"}`,
        detail: `${trips} delivery fee${trips === 1 ? "" : "s"} paid for nothing`,
        amount: trips * DELIVERY_FEE,
      });
    }
    if (o.stage === "returned" && o.deliveredCycle === C && o.returnCondition === "damaged") {
      returnLines.push({ ref: orderRef(o), label: `${o.sku} ×${o.qty} ${L.damagedStock.toLowerCase()}`, detail: "Returned and can't be resold", amount: unitCost(s, o) });
    }
    if (o.stage === "returned" && o.deliveredCycle !== C) {
      returnLines.push({ ref: orderRef(o), label: `${o.customer} · ${L.refunds.toLowerCase()}`, detail: `Delivered ${o.deliveredCycle}, returned ${C}`, amount: orderValue(o) });
    }
  }
  const returnsLeak = make("returns", "costing", L.leak.returns.label, "Delivery fees, damaged stock and refunds on orders that came back or failed this week", returnLines);

  const adLines: DrillLine[] = [];
  for (const p of s.people.filter((x) => x.role === "buyer")) {
    const c = adCost(s, p.id);
    if (!c.overMax) continue;
    adLines.push({
      ref: "Sim. feed",
      label: p.name,
      detail: `₦${c.spend.toLocaleString()} spend ÷ ${c.delivered} delivered = ${c.costPerOrder === null ? "no delivered orders" : `₦${Math.round(c.costPerOrder).toLocaleString()} each`}; your max is ₦${s.maxCostPerOrder.toLocaleString()}. ${SIM_FEED_NOTE}`,
      amount: c.spend - c.delivered * s.maxCostPerOrder,
    });
  }
  const adLeak = make("ads", "costing", L.leak.ads.label, "Ad spend above your max cost per delivered order", adLines);

  const early = paidOnUndelivered(s);
  const payEarly = make("payEarly", "costing", L.leak.payEarly.label, early.subtitle ?? "", early.lines);
  const kept = absorbedDrill(s);
  const payKept = make("payKept", "costing", L.leak.payKept.label, kept.subtitle ?? "", kept.lines);

  return [cashLeak, blockedLeak, returnsLeak, adLeak, payEarly, payKept];
}

/* ------------------------------------------------------------------ impact of an event */

/** Compare the company before and after an event: whose pay moved, and what it did to revenue,
 *  profit, cash with the courier and stock. It is the same engine, so nothing here is estimated. */
export function impactOf(before: DemoState, after: DemoState): Impact {
  const lb = openLines(before);
  const la = openLines(after);
  const pay = salesPeople(after)
    .map((p) => ({ personId: p.id, amount: payslip(la, p.id).gross - payslip(lb, p.id).gross }))
    .filter((x) => Math.abs(x.amount) > 0.5);
  const pb = computePnl(before);
  const pa = computePnl(after);
  const rb = stockRows(before);
  const stock = stockRows(after)
    .map((row) => {
      const was = rb.find((x) => x.product.sku === row.product.sku);
      return { sku: row.product.sku, onHand: [was?.onHand ?? row.onHand, row.onHand] as [number, number], available: [was?.available ?? row.available, row.available] as [number, number] };
    })
    .filter((x) => x.onHand[0] !== x.onHand[1] || x.available[0] !== x.available[1]);
  const out: Impact = { pay, stock };
  const dRevenue = pa.revenue - pb.revenue;
  const dProfit = pa.actual - pb.actual;
  const dStuck = cashWithCourier(after).total - cashWithCourier(before).total;
  if (Math.abs(dRevenue) > 0.5) out.revenue = dRevenue;
  if (Math.abs(dProfit) > 0.5) out.profit = dProfit;
  if (Math.abs(dStuck) > 0.5) out.stuckCash = dStuck;
  return out;
}

/** What each role is allowed to see of an event's impact. Founders see everything; the team lead sees
 *  their own closers' pay and their own; closers and buyers see only their own pay; the warehouse sees stock. */
export function impactFor(s: DemoState, impact: Impact, role: Role): Impact {
  const me = PERSONA[role];
  switch (role) {
    case "founder":
      return impact;
    case "lead":
      return { pay: impact.pay.filter((p) => p.personId === me || personOf(s, p.personId).reportsTo === me), stock: impact.stock };
    case "closer":
    case "buyer":
      return { pay: impact.pay.filter((p) => p.personId === me), stock: impact.stock };
    case "accountant":
      return { ...impact, stock: [] };
    case "stock":
      return { pay: [], stock: impact.stock };
  }
}

export const impactIsEmpty = (i: Impact) =>
  i.pay.length === 0 && i.stock.length === 0 && i.revenue === undefined && i.profit === undefined && i.stuckCash === undefined;

/* ------------------------------------------------------------------ accountant: cash desk & payout queue */

/** Mark paid, lock a cycle, and export the bank file. The founder approves pay (closes the week);
 *  the accountant executes it, so the person who approves money never moves it. The founder can still override. */
export function canSettle(role: Role) {
  return role === "founder" || role === "accountant";
}

/** Close & approve the week's pay. Founder only. */
export function canApprove(role: Role) {
  return role === "founder";
}

/** Record that the courier has handed over COD cash. Whoever handles the parcels does not record the money. */
export function canRecordCash(role: Role) {
  return role === "founder" || role === "accountant";
}

export interface CashRow {
  cycleId: string;
  orders: number;
  /** Value of orders delivered (and kept) in this week. */
  delivered: number;
  received: number;
  outstanding: number;
  /** How many weeks ago the oldest outstanding order was delivered. 0 = this week. */
  ageWeeks: number;
}

export interface CashDesk {
  /** Delivered orders whose cash has not arrived, oldest first. */
  outstanding: Order[];
  total: number;
  oldestWeeks: number;
  rows: CashRow[];
  byCity: { city: string; orders: number; amount: number }[];
  drill: Drill;
}

/** Cash reconciliation: what the courier owes, by week and by city (the courier's patch), and how long it has been owed. */
export function cashDesk(s: DemoState): CashDesk {
  const index = (id: string | undefined) => s.cycles.findIndex((c) => c.id === id);
  const openIdx = index(openCycle(s).id);
  const age = (o: Order) => Math.max(0, openIdx - index(o.deliveredCycle));
  const outstanding = s.orders
    .filter((o) => o.stage === "delivered" && !o.cashIn)
    .sort((a, b) => index(a.deliveredCycle) - index(b.deliveredCycle) || a.id - b.id);

  const rows: CashRow[] = [];
  for (const c of s.cycles) {
    const landed = s.orders.filter((o) => o.stage === "delivered" && o.deliveredCycle === c.id);
    if (landed.length === 0) continue;
    const open = landed.filter((o) => !o.cashIn);
    rows.push({
      cycleId: c.id,
      orders: landed.length,
      delivered: sum(landed.map(orderValue)),
      received: sum(landed.filter((o) => o.cashIn).map(orderValue)),
      outstanding: sum(open.map(orderValue)),
      ageWeeks: open.length ? Math.max(...open.map(age)) : 0,
    });
  }

  const cities = new Map<string, { orders: number; amount: number }>();
  for (const o of outstanding) {
    const cur = cities.get(o.city) ?? { orders: 0, amount: 0 };
    cities.set(o.city, { orders: cur.orders + 1, amount: cur.amount + orderValue(o) });
  }

  return {
    outstanding,
    total: sum(outstanding.map(orderValue)),
    oldestWeeks: outstanding.length ? Math.max(...outstanding.map(age)) : 0,
    rows,
    byCity: [...cities.entries()].map(([city, v]) => ({ city, ...v })).sort((a, b) => b.amount - a.amount),
    drill: cashWithCourier(s),
  };
}

export interface PayoutQueue {
  /** Approved by the founder, waiting for the accountant to pay. */
  awaitingPayment: { cycleId: string; payable: number }[];
  /** Paid, still inside the return window; the accountant locks these. */
  readyToLock: { cycleId: string; payable: number }[];
  next: { kind: "pay" | "lock" | "wait"; cycleId: string };
}

const cyclePayable = (s: DemoState, id: string) => sum(salesPeople(s).map((p) => payslip(cycleLines(s, id), p.id).payable));

export function payoutQueue(s: DemoState): PayoutQueue {
  const awaitingPayment = s.cycles.filter((c) => c.status === "approved").map((c) => ({ cycleId: c.id, payable: cyclePayable(s, c.id) }));
  const readyToLock = s.cycles.filter((c) => c.status === "paid").map((c) => ({ cycleId: c.id, payable: cyclePayable(s, c.id) }));
  const next: PayoutQueue["next"] = awaitingPayment.length
    ? { kind: "pay", cycleId: awaitingPayment[0].cycleId }
    : readyToLock.length
      ? { kind: "lock", cycleId: readyToLock[0].cycleId }
      : { kind: "wait", cycleId: openCycle(s).id };
  return { awaitingPayment, readyToLock, next };
}

export interface SkuEconomics {
  sku: string;
  name: string;
  unitCost: number;
  deliveredQty: number;
  returnedQty: number;
  returnRate: number;
  revenue: number;
  cogs: number;
  damagedLoss: number;
  courierCost: number;
  commission: number;
  netProfit: number;
  drill: Drill;
}

export function skuEconomics(s: DemoState): SkuEconomics[] {
  const c = openCycle(s);
  const lines = openLines(s);
  return s.products.map((p) => {
    const allSku = s.orders.filter((o) => o.sku === p.sku);
    const delAll = allSku.filter((o) => o.stage === "delivered");
    const retAll = allSku.filter((o) => o.stage === "returned");
    const resolved = delAll.length + retAll.length;

    const delC = allSku.filter((o) => o.deliveredCycle === c.id && !(o.stage === "returned" && o.reversedCycle === c.id));
    const retC = allSku.filter((o) => o.stage === "returned" && o.reversedCycle === c.id);
    const failC = allSku.filter((o) => o.failed && o.reversedCycle === c.id);

    const revenue = sum(delC.map(orderValue));
    const cogs = sum(delC.map((o) => o.qty * p.cost));
    const damagedLoss = sum(retC.filter((o) => o.returnCondition === "damaged").map((o) => o.qty * p.cost));
    const courierCost = (delC.length + retC.length * 2 + failC.length) * DELIVERY_FEE;
    const commission = sum(
      lines
        .filter((l) => l.orderId && allSku.some((o) => o.id === l.orderId) && (l.kind === "commission" || l.kind === "clawback"))
        .map((l) => l.amount),
    );
    const netProfit = revenue - cogs - damagedLoss - courierCost - commission;

    return {
      sku: p.sku,
      name: p.name,
      unitCost: p.cost,
      deliveredQty: sum(delC.map((o) => o.qty)),
      returnedQty: sum(retC.map((o) => o.qty)),
      returnRate: resolved ? retAll.length / resolved : 0,
      revenue,
      cogs,
      damagedLoss,
      courierCost,
      commission,
      netProfit,
      drill: {
        title: `${p.sku} (${p.name}) · Unit Economics (${c.id})`,
        subtitle: `Unit cost ₦${p.cost.toLocaleString()} · Lifetime return rate ${Math.round((resolved ? retAll.length / resolved : 0) * 100)}%`,
        lines: [
          { ref: "+", label: "Delivered revenue", detail: `${delC.length} order(s) landed in ${c.id}`, amount: revenue },
          { ref: "−", label: L.productCost, detail: `${sum(delC.map((o) => o.qty))} units × ₦${p.cost.toLocaleString()}`, amount: -cogs },
          ...(damagedLoss ? [{ ref: "−", label: L.damagedStock, detail: "Returned and can't be resold", amount: -damagedLoss }] : []),
          { ref: "−", label: L.deliveryFees, detail: "Delivery, return and failed-delivery trips", amount: -courierCost },
          { ref: "−", label: L.salesPay, detail: "Commission on this product", amount: -commission },
        ],
        total: netProfit,
      },
    };
  });
}

/* ------------------------------------------------------------------ stock */

export type StockStatus = "out" | "reorder" | "inbound" | "watch" | "ok";
export const STOCK_LABEL: Record<StockStatus, string> = {
  out: "Out of stock",
  reorder: "Reorder now",
  inbound: "On order",
  watch: "Running low",
  ok: "Enough stock",
};

export interface StockRow {
  product: Product;
  onHand: number;
  committed: number;
  onOrder: number;
  available: number;
  projected: number;
  status: StockStatus;
  nextEta?: string;
  suggested: number;
}

export function stockRow(s: DemoState, p: Product): StockRow {
  const committed = sum(s.orders.filter((o) => o.sku === p.sku && (o.stage === "confirmed" || o.stage === "dispatched")).map((o) => o.qty));
  const open = s.pos.filter((x) => x.sku === p.sku && x.status === "open");
  const onOrder = sum(open.map((x) => x.qty));
  const available = p.onHand - committed;
  const projected = available + onOrder;
  let status: StockStatus;
  if (available <= p.reorder && onOrder > 0 && projected > p.reorder) status = "inbound";
  else if (projected <= 0) status = "out";
  else if (projected <= p.reorder) status = "reorder";
  else if (projected <= p.reorder * 2) status = "watch";
  else status = "ok";
  const nextEta = open.map((x) => x.eta).sort()[0];
  return { product: p, onHand: p.onHand, committed, onOrder, available, projected, status, nextEta, suggested: Math.max(p.reorder * 3 - projected, p.reorder) };
}

export const stockRows = (s: DemoState) => s.products.map((p) => stockRow(s, p));
export const needsAttention = (s: DemoState) => stockRows(s).filter((r) => r.status === "out" || r.status === "reorder");

/* ------------------------------------------------------------------ permissions */

export type ActionKey = "confirm" | "dispatch" | "deliver" | "fail" | "cash" | "return" | "cancel";

export const ACTION_LABEL: Record<ActionKey, string> = {
  confirm: "Confirm",
  dispatch: "Send out",
  deliver: "Mark delivered",
  fail: "Failed delivery",
  cash: "Cash received",
  return: "Process return",
  cancel: "Cancel",
};

export function canEditRules(role: Role) {
  return role === "founder";
}

/** Segregation of duties: whoever earns on an order never certifies its delivery. */
export function actionsFor(s: DemoState, role: Role, o: Order): ActionKey[] {
  const viewer = PERSONA[role];
  const own = o.closer === viewer || o.openedBy === viewer;
  const sales = (role === "closer" && own) || role === "lead" || role === "founder";
  const ops = role === "stock" || role === "founder";
  const out: ActionKey[] = [];
  switch (o.stage) {
    case "new":
      if (sales) out.push("confirm", "cancel");
      break;
    case "confirmed":
      if (ops) out.push("dispatch");
      if (sales) out.push("cancel");
      break;
    case "dispatched":
      if (ops) out.push("deliver", "fail");
      break;
    case "delivered":
      if (canRecordCash(role) && !o.cashIn) out.push("cash");
      if (ops) out.push("return");
      break;
  }
  return out;
}

export function blockedNote(role: Role, o: Order): string | null {
  if (role === "closer" && (o.stage === "dispatched" || o.stage === "confirmed")) return "The warehouse confirms delivery. You can't mark your own orders delivered.";
  if (role === "closer" && o.stage === "delivered" && !o.cashIn) return "Delivered. The courier has not handed over the cash yet.";
  if (role === "buyer") return null;
  return null;
}

/* ------------------------------------------------------------------ mutations (on a draft) */

const isoDay = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (iso: string, n: number) => {
  const d = new Date(iso + (iso.length === 10 ? "T00:00:00Z" : ""));
  d.setUTCDate(d.getUTCDate() + n);
  return isoDay(d);
};
export const nextCycleId = (id: string) => "W" + (parseInt(id.slice(1), 10) + 1);

/**
 * A copy a mutator can safely edit. structuredClone of a 5,000-order state takes ~200 ms; this takes a few.
 * Orders are flat, so a spread is a full copy. A cycle's frozen `lines`, `pnl` and `carryIn` are shared with the original: engine code only ever
 * replaces them (closeCycle assigns new ones), never edits them in place. verify.ts checks that no mutator touches the state it was given.
 */
export function cloneState(d: DemoState): DemoState {
  return {
    ...d,
    people: d.people.map((x) => ({ ...x })),
    products: d.products.map((x) => ({ ...x })),
    orders: d.orders.map((x) => ({ ...x })),
    cycles: d.cycles.map((c) => ({ ...c })),
    rules: { ...d.rules },
    rulesMeta: Object.fromEntries(Object.entries(d.rulesMeta).map(([k, v]) => [k, { ...v }])) as DemoState["rulesMeta"],
    spend: Object.fromEntries(Object.entries(d.spend).map(([k, v]) => [k, { ...v }])),
    pos: d.pos.map((x) => ({ ...x })),
    audit: structuredClone(d.audit),
  };
}

export function log(d: DemoState, e: Omit<AuditEntry, "id" | "cycle"> & { cycle?: string }) {
  d.seq += 1;
  d.audit.unshift({ id: d.seq, cycle: e.cycle ?? openCycle(d).id, ...e });
  if (d.audit.length > 200) d.audit.length = 200;
}

export function transition(
  d: DemoState,
  orderId: number,
  action: ActionKey,
  opts: { condition?: "resellable" | "damaged" } = {},
): string | null {
  const o = d.orders.find((x) => x.id === orderId);
  if (!o) return "Order not found";
  const c = openCycle(d);
  const p = productOf(d, o.sku);
  switch (action) {
    case "confirm": {
      const row = stockRow(d, p);
      if (row.available < o.qty) {
        return row.onOrder > 0
          ? `Only ${Math.max(0, row.available)} ${o.sku} free. ${row.onOrder} on order, due ${row.nextEta}. Confirm once it lands.`
          : `Only ${Math.max(0, row.available)} ${o.sku} free to promise. Inventory needs to raise a PO first.`;
      }
      o.stage = "confirmed";
      return null;
    }
    case "dispatch":
      o.stage = "dispatched";
      return null;
    case "deliver":
      o.stage = "delivered";
      o.deliveredCycle = c.id;
      p.onHand -= o.qty;
      return null;
    case "fail":
      o.stage = "cancelled";
      o.failed = true;
      o.reversedCycle = c.id;
      return null;
    case "cash":
      o.cashIn = true;
      return null;
    case "return":
      o.stage = "returned";
      o.reversedCycle = c.id;
      o.returnCondition = opts.condition ?? "resellable";
      if (o.returnCondition === "resellable") p.onHand += o.qty;
      return null;
    case "cancel":
      o.stage = "cancelled";
      o.reversedCycle = c.id;
      return null;
  }
}

/** Close the open cycle: freeze lines and P&L, carry negatives and offsets forward,
 *  open the next week. accrued → approved. */
export function closeCycle(d: DemoState, actor: string, at: string) {
  const c = openCycle(d);
  const lines = openLines(d);
  const pnl = computePnl(d);
  const { deferred } = reversals(d, d.rules);
  const nextId = nextCycleId(c.id);
  const carryOut: PayLine[] = [];

  for (const p of salesPeople(d)) {
    const net = sum(lines.filter((l) => l.personId === p.id).map((l) => l.amount));
    if (net < -0.5) {
      lines.push({ key: `${c.id}-carry-${p.id}`, personId: p.id, kind: "carry", amount: -net, note: `Less was earned than was taken back, so the shortfall moves to ${nextId}. Payslips are never negative.` });
      carryOut.push({ key: `${nextId}-carryin-${p.id}`, personId: p.id, kind: "carry", amount: net, note: `Shortfall carried over from ${c.id}` });
    }
  }
  deferred.forEach((l) => carryOut.push({ ...l, key: `${nextId}-${l.key}`, note: l.note + ` · deducted in ${nextId}` }));

  const credited = new Set(lines.filter((l) => l.kind === "commission" && l.orderId).map((l) => l.orderId!));
  for (const o of d.orders) {
    if (credited.has(o.id)) o.creditedCycle = c.id;
    else if (!o.creditedCycle && (o.stage === "returned" || o.stage === "cancelled")) o.closedOut = true;
  }

  c.status = "approved";
  c.lines = lines;
  c.pnl = pnl;
  c.closedAt = at;
  c.closedBy = actor;

  d.cycles.push({ id: nextId, start: addDays(c.start, 7), end: addDays(c.end, 7), status: "open", carryIn: carryOut });
  d.spend[nextId] = { ...(d.spend[c.id] ?? {}) };
}

export function markPaid(d: DemoState, cycleId: string, actor: string, at: string) {
  const c = cycleById(d, cycleId);
  if (!c || c.status !== "approved") return;
  c.status = "paid";
  c.paidAt = at;
  c.paidBy = actor;
}

export function lockCycle(d: DemoState, cycleId: string, actor: string, at: string) {
  const c = cycleById(d, cycleId);
  if (!c || c.status !== "paid") return;
  c.status = "locked";
  c.lockedAt = at;
  c.lockedBy = actor;
}

/** Update a SKU's company price. Orders already created keep the price they were created at. */
export function setProductPrice(d: DemoState, sku: string, price: number): string | null {
  if (!Number.isFinite(price) || price <= 0) return "Enter a price above zero.";
  productOf(d, sku).price = Math.round(price);
  return null;
}

export function raisePO(d: DemoState, sku: string, qty: number, actor: string, at: string) {
  const p = productOf(d, sku);
  const n = d.pos.length + 1;
  d.pos.push({
    id: `PO-${String(n).padStart(3, "0")}`,
    sku,
    qty,
    unitCost: p.cost,
    raisedAt: at,
    raisedBy: actor,
    eta: addDays(at.slice(0, 10), p.leadDays),
    status: "open",
  });
}

export function receivePO(d: DemoState, poId: string, at: string) {
  const po = d.pos.find((x) => x.id === poId);
  if (!po || po.status !== "open") return;
  po.status = "received";
  po.receivedAt = at;
  productOf(d, po.sku).onHand += po.qty;
}

export function createOrder(
  d: DemoState,
  input: {
    customer: string;
    city: string;
    sku: string;
    qty: number;
    openedBy: string;
    closer: string;
    buyer: string;
  },
): Order {
  const c = openCycle(d);
  const maxId = d.orders.reduce((m, o) => Math.max(m, o.id), 1000);
  const order: Order = {
    id: maxId + 1,
    customer: input.customer.trim() || "Walk-in Customer",
    city: input.city,
    sku: input.sku,
    qty: Math.max(1, input.qty),
    unitPrice: productOf(d, input.sku).price,
    openedBy: input.openedBy,
    closer: input.closer,
    buyer: input.buyer,
    stage: "new",
    cashIn: false,
    createdCycle: c.id,
  };
  d.orders.unshift(order);
  return order;
}

/* ------------------------------------------------------------------ exports */

export function payoutCsv(s: DemoState, cycleId: string): string {
  const lines = cycleLines(s, cycleId);
  const rows = [["cycle", "person", "role", "fixed_salary", "sales_pay", "pay_taken_back", "carried_over", "net_payable"]];
  for (const p of salesPeople(s)) {
    const ps = payslip(lines, p.id);
    rows.push([cycleId, p.name, p.title, ps.base, ps.commission, ps.adjustments, ps.carry, ps.payable].map((v) => (typeof v === "number" ? Math.round(v).toString() : v)));
  }
  return rows.map((r) => r.map((v) => (/[",]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(",")).join("\n");
}

