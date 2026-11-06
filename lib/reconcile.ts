// Reconciliation: check that two sources agree, and say exactly where they do not.
//
// Each reconciler takes the company (a DemoState) and one outside file (a courier's cash statement, a stock count,
// a bank statement, the ad platforms' export), and returns categories of exceptions, each with the orders or lines
// behind it as a Drill. Pure: no React, no storage. Files never replace the company; they are only compared with it.

import type { AdSpendRow, DemoState, Drill, DrillLine } from "./types.ts";
import { cycleById, cycleLines, orderValue, payslip, productOf, salesPeople } from "./engine.ts";
import { parseDate, parseNumber, readSheet, type ImportIssue } from "./importer.ts";

/** Money agrees when the two sides are within this many naira. */
export const MONEY_TOLERANCE = 0.5;
const same = (a: number, b: number, tol = MONEY_TOLERANCE) => Math.abs(a - b) <= tol;
const ref = (id: number) => `#${id}`;
const grouped = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const naira = (n: number) => `₦${grouped(n)}`;

export interface Category {
  key: string;
  label: string;
  /** What this means and what to do about it, in plain words. */
  help: string;
  count: number;
  /** Money involved (the size of the gap, or the amount owed). */
  amount: number;
  /** "ok" categories are the agreeing ones; "warn" need a look; "bad" cost money. */
  tone: "ok" | "warn" | "bad";
  drill: Drill;
}

export interface Reconciliation {
  title: string;
  /** Headline: how many things were checked and how many agreed. */
  checked: number;
  agreed: number;
  categories: Category[];
}

function category(key: string, label: string, help: string, tone: Category["tone"], lines: DrillLine[], subtitle?: string): Category {
  const total = lines.reduce((a, l) => a + l.amount, 0);
  return { key, label, help, count: lines.length, amount: total, tone, drill: { title: label, subtitle: subtitle ?? help, lines, total } };
}

/* ------------------------------------------------------------------ reading the outside files */

export interface Parsed<T> {
  rows: T[];
  errors: ImportIssue[];
  warnings: ImportIssue[];
}

export interface Remittance {
  courier: string;
  date: string;
  reference: string;
  orderId: number;
  amount: number;
  fee: number;
  line: number;
}
export interface StockCountRow {
  date: string;
  sku: string;
  counted: number;
  countedBy: string;
  line: number;
}
export interface BankRow {
  date: string;
  reference: string;
  description: string;
  debit: number;
  credit: number;
  payee: string;
  line: number;
}
export interface ReportedSpend {
  date: string;
  buyer: string;
  platform: string;
  amount: number;
  line: number;
}

const norm = (s: string) => s.trim().toLowerCase();

/** Header-plus-example files, one per reconciliation, for the Template buttons. */
export const RECON_TEMPLATES = {
  courier: [
    "courier,date,reference,order_id,amount_remitted,fee",
    "Kwik,2026-11-03,REM-Kwik-20261103,3001,212000,0",
    "GIG,2026-11-03,REM-GIG-20261103,3002,90000,0",
    "",
  ].join("\n"),
  bank: [
    "date,reference,description,debit,credit,payee",
    "2026-11-03,PAY-W44-closer01,Salary and commission W44,58730,,Amaka Obi",
    "2026-11-02,REM-KWIK-WEEK,Courier remittance,,4850000,Kwik Delivery",
    "",
  ].join("\n"),
  reportedSpend: ["date,buyer,platform,amount", "2026-11-02,buyer1,meta,145100", "2026-11-02,buyer1,tiktok,98000", ""].join("\n"),
  stockCount: ["date,sku,counted,counted_by", "2026-11-08,AIR-12,6,stock1", "2026-11-08,BLN-07,11,stock1", ""].join("\n"),
} as const;

export function parseRemittances(text: string): Parsed<Remittance> {
  const errors: ImportIssue[] = [];
  const warnings: ImportIssue[] = [];
  const rows: Remittance[] = [];
  const cols = { courier: "courier", date: "date", reference: "reference", ref: "reference", order_id: "order_id", order: "order_id", amount_remitted: "amount", amount: "amount", fee: "fee" };
  const sheet = readSheet("courier cash", text, cols, ["courier", "date", "order_id", "amount"], errors, warnings);
  if (!sheet) return { rows, errors, warnings };
  for (const r of sheet.rows) {
    const start = errors.length;
    const date = parseDate(r.get("date"));
    if (!date) errors.push({ file: "courier cash", line: r.line, column: "date", message: `Date "${r.get("date")}" must look like 2026-10-27 (year-month-day).` });
    const orderId = parseNumber(r.get("order_id").replace(/^#/, ""));
    if (orderId === null || !Number.isInteger(orderId)) errors.push({ file: "courier cash", line: r.line, column: "order_id", message: `Order id "${r.get("order_id")}" must be a whole number.` });
    const amount = parseNumber(r.get("amount"));
    if (amount === null || amount < 0) errors.push({ file: "courier cash", line: r.line, column: "amount_remitted", message: `Amount "${r.get("amount")}" must be a number, zero or more.` });
    if (errors.length === start && date && orderId !== null && amount !== null) {
      rows.push({ courier: r.get("courier"), date, reference: r.get("reference"), orderId, amount, fee: parseNumber(r.get("fee")) ?? 0, line: r.line });
    }
  }
  return { rows, errors, warnings };
}

export function parseStockCount(text: string): Parsed<StockCountRow> {
  const errors: ImportIssue[] = [];
  const warnings: ImportIssue[] = [];
  const rows: StockCountRow[] = [];
  const cols = { date: "date", sku: "sku", counted: "counted", count: "counted", counted_by: "counted_by" };
  const sheet = readSheet("stock count", text, cols, ["sku", "counted"], errors, warnings);
  if (!sheet) return { rows, errors, warnings };
  const seen = new Map<string, number>();
  for (const r of sheet.rows) {
    const start = errors.length;
    const sku = r.get("sku").toUpperCase();
    if (!sku) errors.push({ file: "stock count", line: r.line, column: "sku", message: "SKU is empty." });
    else if (seen.has(sku)) errors.push({ file: "stock count", line: r.line, column: "sku", message: `SKU ${sku} is already counted on line ${seen.get(sku)}.` });
    else seen.set(sku, r.line);
    const counted = parseNumber(r.get("counted"));
    if (counted === null || counted < 0 || !Number.isInteger(counted)) errors.push({ file: "stock count", line: r.line, column: "counted", message: `Counted "${r.get("counted")}" must be a whole number, zero or more.` });
    const date = r.get("date") ? parseDate(r.get("date")) : "";
    if (date === null) errors.push({ file: "stock count", line: r.line, column: "date", message: `Date "${r.get("date")}" must look like 2026-10-27 (year-month-day).` });
    if (errors.length === start && counted !== null) rows.push({ date: date ?? "", sku, counted, countedBy: r.get("counted_by"), line: r.line });
  }
  return { rows, errors, warnings };
}

export function parseBankStatement(text: string): Parsed<BankRow> {
  const errors: ImportIssue[] = [];
  const warnings: ImportIssue[] = [];
  const rows: BankRow[] = [];
  const cols = { date: "date", reference: "reference", ref: "reference", description: "description", narration: "description", debit: "debit", credit: "credit", payee: "payee", beneficiary: "payee", name: "payee" };
  const sheet = readSheet("bank statement", text, cols, ["date", "debit", "payee"], errors, warnings);
  if (!sheet) return { rows, errors, warnings };
  for (const r of sheet.rows) {
    const start = errors.length;
    const date = parseDate(r.get("date"));
    if (!date) errors.push({ file: "bank statement", line: r.line, column: "date", message: `Date "${r.get("date")}" must look like 2026-10-27 (year-month-day).` });
    const debit = r.get("debit") === "" ? 0 : parseNumber(r.get("debit"));
    if (debit === null || debit < 0) errors.push({ file: "bank statement", line: r.line, column: "debit", message: `Debit "${r.get("debit")}" must be a number, zero or more.` });
    const credit = r.get("credit") === "" ? 0 : parseNumber(r.get("credit"));
    if (credit === null || credit < 0) errors.push({ file: "bank statement", line: r.line, column: "credit", message: `Credit "${r.get("credit")}" must be a number, zero or more.` });
    if (errors.length === start && date && debit !== null && credit !== null) {
      rows.push({ date, reference: r.get("reference"), description: r.get("description"), debit, credit, payee: r.get("payee"), line: r.line });
    }
  }
  return { rows, errors, warnings };
}

export function parseReportedSpend(text: string): Parsed<ReportedSpend> {
  const errors: ImportIssue[] = [];
  const warnings: ImportIssue[] = [];
  const rows: ReportedSpend[] = [];
  const cols = { date: "date", buyer: "buyer", media_buyer: "buyer", platform: "platform", amount: "amount", spend: "amount" };
  const sheet = readSheet("reported ad spend", text, cols, ["date", "buyer", "platform", "amount"], errors, warnings);
  if (!sheet) return { rows, errors, warnings };
  for (const r of sheet.rows) {
    const start = errors.length;
    const date = parseDate(r.get("date"));
    if (!date) errors.push({ file: "reported ad spend", line: r.line, column: "date", message: `Date "${r.get("date")}" must look like 2026-10-27 (year-month-day).` });
    const amount = parseNumber(r.get("amount"));
    if (amount === null || amount < 0) errors.push({ file: "reported ad spend", line: r.line, column: "amount", message: `Amount "${r.get("amount")}" must be a number, zero or more.` });
    if (errors.length === start && date && amount !== null) rows.push({ date, buyer: norm(r.get("buyer")), platform: norm(r.get("platform")), amount, line: r.line });
  }
  return { rows, errors, warnings };
}

/* ------------------------------------------------------------------ courier cash */

export interface CourierCashResult extends Reconciliation {
  /** Orders the courier has paid for that the system does not yet show as received: safe to record. */
  recordable: number[];
  /** What delivered orders are worth when the courier has paid nothing and the system shows nothing. */
  owedTotal: number;
  lines: number;
}

/** Match a courier's cash statement to the delivered orders, one line per order. */
export function reconcileCourierCash(s: DemoState, statement: Remittance[]): CourierCashResult {
  const byId = new Map(s.orders.map((o) => [o.id, o]));
  const first = new Map<number, Remittance>();
  const dup: DrillLine[] = [];
  const unknown: DrillLine[] = [];
  for (const r of statement) {
    if (!byId.has(r.orderId)) {
      unknown.push({ ref: ref(r.orderId), label: `${r.courier} · ${r.reference}`, detail: `Line ${r.line}: no order #${r.orderId} in the system`, amount: r.amount });
      continue;
    }
    const prev = first.get(r.orderId);
    if (prev) dup.push({ ref: ref(r.orderId), label: `${byId.get(r.orderId)!.customer} · ${r.courier}`, detail: `Line ${r.line} repeats line ${prev.line} (${r.reference})`, amount: r.amount });
    else first.set(r.orderId, r);
  }

  const matched: DrillLine[] = [];
  const short: DrillLine[] = [];
  const over: DrillLine[] = [];
  const notDelivered: DrillLine[] = [];
  const notRecorded: DrillLine[] = [];
  const recordable: number[] = [];
  for (const [id, r] of first) {
    const o = byId.get(id)!;
    const value = orderValue(o);
    const who = `${o.customer} · ${o.city}`;
    if (o.stage !== "delivered") {
      notDelivered.push({ ref: ref(id), label: who, detail: `${r.courier} paid ${naira(r.amount)} but the order is ${o.stage}${o.failed ? " (failed delivery)" : ""}`, amount: r.amount });
      continue;
    }
    if (same(r.amount, value)) matched.push({ ref: ref(id), label: who, detail: `${r.courier} · ${r.reference}`, amount: r.amount });
    else if (r.amount < value) short.push({ ref: ref(id), label: who, detail: `${r.courier} paid ${naira(r.amount)} of ${naira(value)} · ${r.reference}`, amount: value - r.amount });
    else over.push({ ref: ref(id), label: who, detail: `${r.courier} paid ${naira(r.amount)} for a ${naira(value)} order · ${r.reference}`, amount: r.amount - value });
    if (!o.cashIn) {
      notRecorded.push({ ref: ref(id), label: who, detail: `${r.courier} remitted it on ${r.date}; the system still shows the cash with the courier`, amount: r.amount });
      recordable.push(id);
    }
  }

  const recordedMissing: DrillLine[] = [];
  const owed: DrillLine[] = [];
  for (const o of s.orders) {
    if (o.stage !== "delivered" || first.has(o.id)) continue;
    const row = { ref: ref(o.id), label: `${o.customer} · ${o.city}`, amount: orderValue(o) };
    if (o.cashIn) recordedMissing.push({ ...row, detail: `Recorded as received, but ${o.courier ?? "the courier"}'s statement has no line for it` });
    else owed.push({ ...row, detail: `Delivered ${o.deliveredCycle}, not on the statement and not recorded: still owed${o.courier ? ` by ${o.courier}` : ""}` });
  }

  const cats = [
    category("matched", "Paid in full", "The courier paid exactly what the order is worth.", "ok", matched),
    category("short", "Paid short", "The courier handed over less than the order is worth. Ask for the difference.", "bad", short),
    category("over", "Paid too much", "More than the order is worth. Check the order value and refund if it is the customer's money.", "warn", over),
    category("duplicate", "Listed twice", "The same order appears more than once on the statement. Count it once.", "warn", dup),
    category("notDelivered", "Paid for an order that is not delivered", "The courier remitted cash for an order that is returned, cancelled or still on the road. Find out why.", "bad", notDelivered),
    category("unknown", "Order not found", "A line names an order that is not in the system.", "warn", unknown),
    category("notRecorded", "Paid, but not recorded here", "The courier says it paid; the system still shows the cash with the courier. Record it as received.", "warn", notRecorded),
    category("recordedMissing", "Recorded here, not on the statement", "The system says the cash arrived, but the courier's statement has no line for it. Check with your accountant.", "bad", recordedMissing),
    category("owed", "Delivered, still owed", "Delivered, not on the statement and not recorded. This is the money the courier still holds.", "warn", owed),
  ];
  return {
    title: "Courier cash against delivered orders",
    checked: first.size,
    agreed: matched.length,
    categories: cats,
    recordable,
    owedTotal: owed.reduce((a, l) => a + l.amount, 0),
    lines: statement.length,
  };
}

/* ------------------------------------------------------------------ ad spend */

/** Compare what the ad platforms billed (the company's ad spend lines) with what each media buyer reported, per day, buyer and platform. */
export function reconcileAdSpend(platformRows: AdSpendRow[], reported: ReportedSpend[], names?: (id: string) => string): Reconciliation {
  const key = (d: string, b: string, p: string) => `${d}|${norm(b)}|${norm(p)}`;
  const billed = new Map<string, number>();
  for (const r of platformRows) billed.set(key(r.date, r.buyer, r.platform), (billed.get(key(r.date, r.buyer, r.platform)) ?? 0) + r.spend);
  const told = new Map<string, number>();
  for (const r of reported) told.set(key(r.date, r.buyer, r.platform), (told.get(key(r.date, r.buyer, r.platform)) ?? 0) + r.amount);
  const nm = names ?? ((id: string) => id);

  const agree: DrillLine[] = [];
  const differ: DrillLine[] = [];
  const unreported: DrillLine[] = [];
  const extra: DrillLine[] = [];
  const label = (k: string) => {
    const [d, b, p] = k.split("|");
    return { ref: d, label: `${nm(b)} · ${p}` };
  };
  for (const [k, amount] of billed) {
    const t = told.get(k);
    const l = label(k);
    if (t === undefined) unreported.push({ ...l, detail: `The platform billed ${naira(amount)}; the buyer reported nothing for this day`, amount });
    else if (same(t, amount, 1)) agree.push({ ...l, detail: naira(amount), amount });
    else differ.push({ ...l, detail: `Platform ${naira(amount)}, buyer reported ${naira(t)}`, amount: amount - t });
  }
  for (const [k, amount] of told) {
    if (!billed.has(k)) extra.push({ ...label(k), detail: `Reported ${naira(amount)}; no platform line for it`, amount });
  }
  const byDate = (a: DrillLine, b: DrillLine) => (a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0);
  differ.sort(byDate);
  unreported.sort(byDate);

  return {
    title: "Ad spend: platforms against what buyers reported",
    checked: billed.size,
    agreed: agree.length,
    categories: [
      category("agree", "Agree", "The platform and the buyer report the same spend.", "ok", agree),
      category("differ", "Different amounts", "The platform billed more or less than the buyer reported. Positive = the buyer reported less than billed.", "bad", differ),
      category("unreported", "Not reported by the buyer", "The platform billed for the day, but the buyer's own record has nothing.", "warn", unreported),
      category("extra", "Reported, no platform line", "The buyer reported spend that no platform export shows.", "warn", extra),
    ],
  };
}

/** Totals by platform, for the ad spend card. */
export function spendByPlatform(rows: AdSpendRow[]): { platform: string; spend: number; leads: number; clicks: number }[] {
  const m = new Map<string, { platform: string; spend: number; leads: number; clicks: number }>();
  for (const r of rows) {
    const x = m.get(r.platform) ?? { platform: r.platform, spend: 0, leads: 0, clicks: 0 };
    x.spend += r.spend;
    x.leads += r.leads ?? 0;
    x.clicks += r.clicks ?? 0;
    m.set(r.platform, x);
  }
  return [...m.values()].sort((a, b) => b.spend - a.spend);
}

/* ------------------------------------------------------------------ stock */

export interface StockResult extends Reconciliation {
  /** Net units (counted minus system) across counted SKUs, and what that is worth at cost. */
  netUnits: number;
  netValue: number;
}

/** Compare a physical count with the stock the system believes is on the shelf. */
export function reconcileStock(s: DemoState, count: StockCountRow[]): StockResult {
  const counted = new Map(count.map((c) => [c.sku, c]));
  const agree: DrillLine[] = [];
  const short: DrillLine[] = [];
  const surplus: DrillLine[] = [];
  const notCounted: DrillLine[] = [];
  let netUnits = 0;
  let netValue = 0;
  for (const p of s.products) {
    const c = counted.get(p.sku);
    if (!c) {
      notCounted.push({ ref: p.sku, label: p.name, detail: `${p.onHand} on the shelf in the system, no count given`, amount: 0 });
      continue;
    }
    const diff = c.counted - p.onHand;
    netUnits += diff;
    netValue += diff * p.cost;
    if (diff === 0) agree.push({ ref: p.sku, label: p.name, detail: `${p.onHand} counted and in the system`, amount: 0 });
    else if (diff < 0) short.push({ ref: p.sku, label: p.name, detail: `System ${p.onHand}, counted ${c.counted}: ${-diff} missing${c.countedBy ? ` (counted by ${c.countedBy})` : ""}`, amount: diff * p.cost });
    else surplus.push({ ref: p.sku, label: p.name, detail: `System ${p.onHand}, counted ${c.counted}: ${diff} extra, perhaps returns not yet recorded`, amount: diff * p.cost });
  }
  const unknown: DrillLine[] = [];
  for (const c of count) if (!s.products.some((p) => p.sku === c.sku)) unknown.push({ ref: c.sku, label: "Not a product", detail: `Line ${c.line}: ${c.sku} is not in the product list`, amount: 0 });
  void productOf;
  return {
    title: "Stock count against the system",
    checked: count.length,
    agreed: agree.length,
    netUnits,
    netValue,
    categories: [
      category("agree", "Count matches", "The shelf has exactly what the system says.", "ok", agree),
      category("short", "Missing units", "Fewer on the shelf than the system says. Value shown at product cost: this is shrinkage.", "bad", short),
      category("surplus", "Extra units", "More on the shelf than the system says. Often returns that were never recorded.", "warn", surplus),
      category("notCounted", "Not counted", "Products missing from the count file.", "warn", notCounted),
      category("unknown", "Unknown SKU", "SKUs in the count that are not products.", "warn", unknown),
    ],
  };
}

/* ------------------------------------------------------------------ payouts */

export interface PayoutResult extends Reconciliation {
  cycleId: string;
  expectedTotal: number;
  paidTotal: number;
}

/** Compare what a closed week says each person is owed with what actually left the bank account. */
export function reconcilePayouts(s: DemoState, cycleId: string, bank: BankRow[]): PayoutResult {
  const cycle = cycleById(s, cycleId);
  const lines = cycleLines(s, cycleId);
  const people = salesPeople(s)
    .map((p) => ({ p, due: Math.round(payslip(lines, p.id).payable) }))
    .filter((x) => x.due > 0);
  const byKey = new Map<string, (typeof people)[number]>();
  for (const x of people) {
    byKey.set(norm(x.p.name), x);
    byKey.set(norm(x.p.id), x);
  }
  const debits = bank.filter((b) => b.debit > 0);
  const findPerson = (b: BankRow) => byKey.get(norm(b.payee)) ?? [...byKey.entries()].find(([k]) => norm(b.reference).includes(k) && k.length > 3)?.[1];

  const paidBy = new Map<string, BankRow[]>();
  const unknown: DrillLine[] = [];
  for (const b of debits) {
    const x = findPerson(b);
    if (!x) {
      unknown.push({ ref: b.date, label: b.payee || "(no payee)", detail: `Line ${b.line}: ${b.reference || b.description} is not a person owed pay this week`, amount: b.debit });
      continue;
    }
    const arr = paidBy.get(x.p.id) ?? [];
    arr.push(b);
    paidBy.set(x.p.id, arr);
  }

  const ok: DrillLine[] = [];
  const wrong: DrillLine[] = [];
  const missing: DrillLine[] = [];
  const dup: DrillLine[] = [];
  let paidTotal = 0;
  for (const { p, due } of people) {
    const rows = paidBy.get(p.id) ?? [];
    const paid = rows.reduce((a, r) => a + r.debit, 0);
    paidTotal += paid;
    if (rows.length === 0) missing.push({ ref: p.id, label: p.name, detail: `Owed ${naira(due)} for ${cycleId}; nothing left the bank`, amount: due });
    else if (rows.length > 1) dup.push({ ref: p.id, label: p.name, detail: `${rows.length} payments (${rows.map((r) => naira(r.debit)).join(" + ")}) for ${naira(due)} owed`, amount: paid - due });
    else if (same(paid, due, 1)) ok.push({ ref: p.id, label: p.name, detail: `${naira(due)} paid ${rows[0].date}`, amount: due });
    else wrong.push({ ref: p.id, label: p.name, detail: `Owed ${naira(due)}, paid ${naira(paid)}${paid < due ? " (short)" : " (too much)"}`, amount: paid - due });
  }
  void cycle;
  return {
    title: `${cycleId} payouts against the bank statement`,
    cycleId,
    checked: people.length,
    agreed: ok.length,
    expectedTotal: people.reduce((a, x) => a + x.due, 0),
    paidTotal,
    categories: [
      category("ok", "Paid correctly", "The amount that left the bank is exactly what the payslip says.", "ok", ok),
      category("wrong", "Wrong amount", "Paid, but not the amount on the payslip. Negative = paid too little.", "bad", wrong),
      category("missing", "Not paid", "Owed pay for the week, but no payment in the bank statement.", "bad", missing),
      category("duplicate", "Paid twice", "More than one payment to the same person for the same week.", "bad", dup),
      category("unknown", "Unknown payee", "Money left the bank to someone who is not owed pay for this week.", "warn", unknown),
    ],
  };
}

/** The exceptions of any reconciliation as a CSV, for the accountant to chase. */
export function exceptionsCsv(r: Reconciliation): string {
  const esc = (v: unknown) => {
    const t = String(v ?? "");
    return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const rows = [["category", "reference", "who", "detail", "amount"]];
  for (const c of r.categories) {
    if (c.tone === "ok") continue;
    for (const l of c.drill.lines) rows.push([c.label, l.ref, l.label, l.detail ?? "", String(Math.round(l.amount))]);
  }
  return rows.map((x) => x.map(esc).join(",")).join("\n") + "\n";
}
