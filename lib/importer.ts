// "Try it with your orders": turn up to three CSV files into a full DemoState, in the browser.
// Pure: no React, no storage, no network. The same engine that powers the demo recomputes everything.

import type { DemoState, Order, Person, Product, Stage } from "./types.ts";
import { closeCycle, lockCycle, markPaid, log } from "./engine.ts";
import { DEFAULT_MAX_COST_PER_ORDER, SEED_VERSION, buildSeed } from "./seed.ts";

/* ------------------------------------------------------------------ public types */

export type ImportFile = "orders" | "ad spend" | "products";

export interface ImportIssue {
  file: ImportFile;
  /** 1-based line in the file (the header is line 1). 0 means the file as a whole. */
  line: number;
  column?: string;
  message: string;
}

export interface ImportSummary {
  orders: number;
  weeks: number;
  firstWeek: string;
  openWeek: string;
  skus: number;
  adSpendTotal: number;
  notes: string[];
  warnings: ImportIssue[];
}

export type ImportResult =
  | { ok: true; state: DemoState; summary: ImportSummary }
  | { ok: false; errors: ImportIssue[]; warnings: ImportIssue[] };

export interface ImportFiles {
  orders: string;
  adSpend?: string;
  products?: string;
}

export const MAX_ROWS = 5000;
export const MAX_WEEKS = 26;
export const MAX_FILE_BYTES = 2 * 1024 * 1024;
/** Size of the saved state, in characters, above which the browser's storage quota is at risk. */
export const MAX_STORED_CHARS = 4_200_000;
const MAX_ERRORS = 200;

/** The one media buyer every imported order is credited to (the file has no buyer column). */
export const IMPORT_BUYER_ID = "tobi";
export const IMPORT_BUYER_NAME = "Imported Ads";

export const TEMPLATES = {
  orders: [
    "order_id,date,customer,city,sku,qty,price,stage,closer,campaign",
    "3001,2026-10-20,Ada Obi,Lagos,AIR-12,1,212000,delivered,amaka,October promo",
    "3002,2026-10-21,Musa Bello,Kano,KET-03,2,45000,delivered,chidi,October promo",
    "3003,2026-10-22,Ife Ade,Abuja,BLN-07,1,73500,returned,amaka,Retargeting",
    "3004,2026-10-27,Tola Eze,Lagos,VAC-21,1,187000,delivered,chidi,October promo",
    "3005,2026-10-28,Emma Udo,Enugu,STM-09,1,112000,dispatched,amaka,",
    "3006,2026-10-29,Kemi Ola,Ibadan,AIR-12,1,212000,new,chidi,Retargeting",
    "",
  ].join("\n"),
  adSpend: ["date,amount", "2026-10-20,40000", "2026-10-23,35000", "2026-10-27,45000", "2026-10-29,30000", ""].join("\n"),
  products: [
    "sku,name,cost,on_hand",
    "AIR-12,Air fryer 5.5L,78000,6",
    "BLN-07,Blender Pro 1200W,34000,12",
    "KET-03,Electric kettle 1.7L,19500,8",
    "VAC-21,Handheld vacuum,96000,5",
    "STM-09,Garment steamer,52000,9",
    "",
  ].join("\n"),
} as const;

/* ------------------------------------------------------------------ CSV */

export interface CsvRow {
  line: number;
  cells: string[];
}

/** Small RFC 4180 reader: quoted fields, "" escapes, commas and newlines inside quotes, CRLF, BOM. */
export function parseCsv(text: string): CsvRow[] {
  const src = text.replace(/^﻿/, "");
  const rows: CsvRow[] = [];
  let cells: string[] = [];
  let cur = "";
  let inQuotes = false;
  let line = 1;
  let rowLine = 1;
  const pushRow = () => {
    cells.push(cur);
    cur = "";
    if (!(cells.length === 1 && cells[0].trim() === "")) rows.push({ line: rowLine, cells });
    cells = [];
  };
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQuotes = false;
      } else {
        if (ch === "\n") line++;
        cur += ch;
      }
      continue;
    }
    if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      cells.push(cur);
      cur = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      pushRow();
      line++;
      rowLine = line;
    } else cur += ch;
  }
  if (cur !== "" || cells.length > 0) pushRow();
  return rows;
}

const norm = (h: string) => h.trim().toLowerCase().replace(/[\s-]+/g, "_");

const ORDER_COLUMNS: Record<string, string> = {
  order_id: "order_id", id: "order_id", order: "order_id", order_no: "order_id", order_number: "order_id",
  date: "date", order_date: "date",
  customer: "customer", customer_name: "customer",
  city: "city",
  sku: "sku", product: "sku", product_sku: "sku",
  qty: "qty", quantity: "qty",
  price: "price", unit_price: "price",
  stage: "stage", status: "stage",
  closer: "closer", sales_rep: "closer", rep: "closer",
  campaign: "campaign",
};
const ORDER_REQUIRED = ["order_id", "date", "customer", "city", "sku", "qty", "price", "stage", "closer"];

const AD_COLUMNS: Record<string, string> = { date: "date", day: "date", amount: "amount", spend: "amount", ad_spend: "amount", cost: "amount" };
const PRODUCT_COLUMNS: Record<string, string> = {
  sku: "sku",
  name: "name", product: "name", product_name: "name",
  cost: "cost", unit_cost: "cost", product_cost: "cost",
  on_hand: "on_hand", stock: "on_hand", onhand: "on_hand",
  price: "price", unit_price: "price",
};

const STAGES: Record<string, { stage: Stage; failed?: boolean }> = {
  new: { stage: "new" }, lead: { stage: "new" },
  confirmed: { stage: "confirmed" },
  dispatched: { stage: "dispatched" }, shipped: { stage: "dispatched" },
  delivered: { stage: "delivered" },
  returned: { stage: "returned" }, return: { stage: "returned" },
  cancelled: { stage: "cancelled" }, canceled: { stage: "cancelled" },
  failed: { stage: "cancelled", failed: true },
};

/* ------------------------------------------------------------------ dates & numbers */

function parseDate(s: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? s.trim() : null;
}
const addDaysIso = (iso: string, n: number) => {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const mondayOf = (iso: string) => addDaysIso(iso, -((new Date(iso + "T00:00:00Z").getUTCDay() + 6) % 7));
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);

export function isoWeekNumber(iso: string): number {
  const thursdayOf = (x: Date) => {
    const c = new Date(x.getTime());
    c.setUTCDate(c.getUTCDate() - ((c.getUTCDay() + 6) % 7) + 3);
    return c;
  };
  const d = thursdayOf(new Date(iso + "T00:00:00Z"));
  const week1Thursday = thursdayOf(new Date(Date.UTC(d.getUTCFullYear(), 0, 4)));
  return 1 + Math.round((d.getTime() - week1Thursday.getTime()) / (7 * 86400000));
}

/** "212,000", "₦212 000" and "212000.00" all read as 212000. */
function parseNumber(s: string): number | null {
  const cleaned = s.replace(/[₦,\s]/g, "");
  if (cleaned === "" || !/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
}

/* ------------------------------------------------------------------ sheet reading */

interface Sheet {
  rows: { line: number; get: (col: string) => string }[];
}

function readSheet(
  file: ImportFile,
  text: string,
  columns: Record<string, string>,
  required: string[],
  errors: ImportIssue[],
  warnings: ImportIssue[],
): Sheet | null {
  const all = parseCsv(text);
  if (all.length === 0) {
    errors.push({ file, line: 0, message: "The file is empty. Download the template to see the columns." });
    return null;
  }
  const header = all[0].cells.map(norm);
  const index: Record<string, number> = {};
  header.forEach((h, i) => {
    const canonical = columns[h];
    if (!canonical) {
      if (h) warnings.push({ file, line: 1, column: all[0].cells[i].trim(), message: "Column not recognised, so it is ignored." });
    } else if (!(canonical in index)) index[canonical] = i;
  });
  const missing = required.filter((c) => !(c in index));
  if (missing.length) {
    errors.push({ file, line: 1, message: `Missing column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}. Download the template to see the exact headings.` });
    return null;
  }
  const body = all.slice(1);
  if (body.length === 0) {
    errors.push({ file, line: 0, message: "The file has a header but no rows." });
    return null;
  }
  if (body.length > MAX_ROWS) {
    errors.push({ file, line: 0, message: `Too many rows (${body.length}). The limit is ${MAX_ROWS}.` });
    return null;
  }
  return {
    rows: body.map((r) => ({
      line: r.line,
      get: (col: string) => (col in index ? (r.cells[index[col]] ?? "").trim() : ""),
    })),
  };
}

/* ------------------------------------------------------------------ main */

export function importData(files: ImportFiles): ImportResult {
  const errors: ImportIssue[] = [];
  const warnings: ImportIssue[] = [];
  const fail = (): ImportResult => ({ ok: false, errors: errors.slice(0, MAX_ERRORS), warnings });
  const err = (file: ImportFile, line: number, column: string | undefined, message: string) => {
    if (errors.length < MAX_ERRORS + 1) errors.push({ file, line, column, message });
  };

  const base = buildSeed();
  const closers = base.people.filter((p) => p.role === "closer");
  const closerKey = new Map<string, Person>();
  for (const c of closers) {
    closerKey.set(c.id.toLowerCase(), c);
    closerKey.set(c.name.toLowerCase(), c);
    closerKey.set(c.name.split(" ")[0].toLowerCase(), c);
  }
  // Closers not in the demo team are created from the file, so a prospect never has to rename their own people.
  const MAX_NEW_CLOSERS = 12;
  const newClosers = new Map<string, Person>();
  const closerFor = (raw: string): Person | null => {
    const typed = raw.trim().replace(/s+/g, " ");
    if (!typed) return null;
    const known = closerKey.get(typed.toLowerCase());
    if (known) return known;
    const made = newClosers.get(typed.toLowerCase());
    if (made) return made;
    if (newClosers.size >= MAX_NEW_CLOSERS) return null;
    const slug = typed.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "closer";
    let id = "imp-" + slug;
    for (let n = 2; closerKey.has(id) || [...newClosers.values()].some((p) => p.id === id); n++) id = "imp-" + slug + "-" + n;
    const p: Person = { id, name: typed, role: "closer", title: "Closer", monthlyBase: closers[0]?.monthlyBase ?? 70000, reportsTo: closers[0]?.reportsTo };
    newClosers.set(typed.toLowerCase(), p);
    return p;
  };

  /* ---- products (optional) */
  const catalog = new Map<string, { name?: string; cost?: number; onHand?: number; price?: number }>();
  if (files.products && files.products.trim()) {
    const sheet = readSheet("products", files.products, PRODUCT_COLUMNS, ["sku", "cost"], errors, warnings);
    if (sheet) {
      for (const r of sheet.rows) {
        const sku = r.get("sku").toUpperCase();
        if (!sku) {
          err("products", r.line, "sku", "SKU is empty.");
          continue;
        }
        const cost = parseNumber(r.get("cost"));
        if (cost === null || cost < 0) {
          err("products", r.line, "cost", `Cost "${r.get("cost")}" is not a number.`);
          continue;
        }
        const entry: { name?: string; cost?: number; onHand?: number; price?: number } = { cost, name: r.get("name") || undefined };
        if (r.get("on_hand") !== "") {
          const oh = parseNumber(r.get("on_hand"));
          if (oh === null || oh < 0 || !Number.isInteger(oh)) err("products", r.line, "on_hand", `On hand "${r.get("on_hand")}" must be a whole number.`);
          else entry.onHand = oh;
        }
        if (r.get("price") !== "") {
          const pr = parseNumber(r.get("price"));
          if (pr === null || pr <= 0) err("products", r.line, "price", `Price "${r.get("price")}" must be a number above zero.`);
          else entry.price = pr;
        }
        if (catalog.has(sku)) err("products", r.line, "sku", `SKU ${sku} appears twice.`);
        catalog.set(sku, entry);
      }
    }
  }

  /* ---- orders */
  const sheet = readSheet("orders", files.orders ?? "", ORDER_COLUMNS, ORDER_REQUIRED, errors, warnings);
  if (!sheet) return fail();

  interface Parsed {
    line: number;
    id: number;
    date: string;
    customer: string;
    city: string;
    sku: string;
    qty: number;
    price: number;
    stage: Stage;
    failed: boolean;
    closer: string;
    campaign: string;
  }
  const parsed: Parsed[] = [];
  const seen = new Map<number, number>();
  for (const r of sheet.rows) {
    const start = errors.length;
    const idRaw = r.get("order_id").replace(/^#/, "");
    const id = parseNumber(idRaw);
    if (id === null || !Number.isInteger(id) || id <= 0) err("orders", r.line, "order_id", `Order id "${r.get("order_id")}" must be a whole number above zero.`);
    else if (seen.has(id)) err("orders", r.line, "order_id", `Order id ${id} is already used on line ${seen.get(id)}.`);
    else seen.set(id, r.line);

    const date = parseDate(r.get("date"));
    if (!date) err("orders", r.line, "date", `Date "${r.get("date")}" must look like 2026-10-27 (year-month-day).`);

    const customer = r.get("customer");
    if (!customer) err("orders", r.line, "customer", "Customer name is empty.");
    const city = r.get("city");
    if (!city) err("orders", r.line, "city", "City is empty.");

    const sku = r.get("sku").toUpperCase();
    if (!sku) err("orders", r.line, "sku", "SKU is empty.");

    const qty = parseNumber(r.get("qty"));
    if (qty === null || !Number.isInteger(qty) || qty < 1 || qty > 1000) err("orders", r.line, "qty", `Quantity "${r.get("qty")}" must be a whole number from 1 to 1000.`);

    const price = parseNumber(r.get("price"));
    if (price === null || price <= 0 || price > 1e9) err("orders", r.line, "price", `Price "${r.get("price")}" must be a number above zero. Use the price for one unit.`);

    const st = STAGES[r.get("stage").toLowerCase()];
    if (!st) err("orders", r.line, "stage", `Stage "${r.get("stage")}" must be one of: new, confirmed, dispatched, delivered, returned, cancelled, failed.`);

    const closer = closerFor(r.get("closer"));
    if (!closer) err("orders", r.line, "closer", r.get("closer").trim() ? `More than ${MAX_NEW_CLOSERS} different closer names. Check the closer column for typos.` : "The closer is empty. Put the name of the person who sold the order.");

    if (errors.length === start && id !== null && date && qty !== null && price !== null && st && closer) {
      parsed.push({ line: r.line, id, date, customer, city, sku, qty, price, stage: st.stage, failed: Boolean(st.failed), closer: closer.id, campaign: r.get("campaign") });
    }
  }

  /* ---- SKUs need a product cost: from the products file, or the demo catalogue */
  const demoBySku = new Map(base.products.map((p) => [p.sku, p]));
  const skusUsed = [...new Set(parsed.map((p) => p.sku))];
  for (const sku of skusUsed) {
    if (catalog.get(sku)?.cost === undefined && !demoBySku.has(sku)) {
      const firstLine = parsed.find((p) => p.sku === sku)!.line;
      err("orders", firstLine, "sku", `SKU ${sku} has no product cost. Add it to the products file (columns: sku, name, cost, on_hand) so profit is not overstated.`);
    }
  }
  if (errors.length > 0) return fail();

  /* ---- ad spend (optional) */
  const spendByDate: { date: string; amount: number; line: number }[] = [];
  if (files.adSpend && files.adSpend.trim()) {
    const ad = readSheet("ad spend", files.adSpend, AD_COLUMNS, ["date", "amount"], errors, warnings);
    if (ad) {
      for (const r of ad.rows) {
        const date = parseDate(r.get("date"));
        const amount = parseNumber(r.get("amount"));
        if (!date) err("ad spend", r.line, "date", `Date "${r.get("date")}" must look like 2026-10-27 (year-month-day).`);
        if (amount === null || amount < 0) err("ad spend", r.line, "amount", `Amount "${r.get("amount")}" must be a number, zero or more.`);
        if (date && amount !== null && amount >= 0) spendByDate.push({ date, amount, line: r.line });
      }
    }
  }
  if (errors.length > 0) return fail();

  /* ---- weeks (Monday to Sunday) */
  const mondays = parsed.map((p) => mondayOf(p.date)).sort();
  const firstMonday = mondays[0];
  const lastMonday = mondays[mondays.length - 1];
  const weekCount = daysBetween(firstMonday, lastMonday) / 7 + 1;
  if (weekCount > MAX_WEEKS) {
    err("orders", 0, "date", `The dates span ${weekCount} weeks. The limit is ${MAX_WEEKS}. Split the file or trim the oldest rows.`);
    return fail();
  }
  const firstNumber = isoWeekNumber(firstMonday);
  const cycleIds = Array.from({ length: weekCount }, (_, i) => `W${firstNumber + i}`);
  const weekIndex = (iso: string) => daysBetween(firstMonday, mondayOf(iso)) / 7;

  const spendPerWeek = new Array<number>(weekCount).fill(0);
  let spendTotal = 0;
  for (const s of spendByDate) {
    const wi = weekIndex(s.date);
    if (wi < 0 || wi >= weekCount) {
      warnings.push({ file: "ad spend", line: s.line, column: "date", message: `${s.date} is outside the weeks covered by the orders, so it is ignored.` });
      continue;
    }
    spendPerWeek[wi] += s.amount;
    spendTotal += s.amount;
  }

  /* ---- products */
  const notes: string[] = [];
  const openUnits = new Map<string, number>();
  for (const p of parsed) {
    if (p.stage === "new" || p.stage === "confirmed" || p.stage === "dispatched") openUnits.set(p.sku, (openUnits.get(p.sku) ?? 0) + p.qty);
  }
  const lastPrice = new Map<string, { price: number; key: string }>();
  const prices = new Map<string, Set<number>>();
  for (const p of parsed) {
    const key = `${p.date}#${String(p.id).padStart(12, "0")}`;
    const cur = lastPrice.get(p.sku);
    if (!cur || key > cur.key) lastPrice.set(p.sku, { price: p.price, key });
    if (!prices.has(p.sku)) prices.set(p.sku, new Set());
    prices.get(p.sku)!.add(p.price);
  }
  const products: Product[] = [];
  const assumedStock: string[] = [];
  for (const sku of skusUsed) {
    const demo = demoBySku.get(sku);
    const given = catalog.get(sku);
    const reorder = demo?.reorder ?? 3;
    let onHand = given?.onHand;
    if (onHand === undefined) {
      onHand = (openUnits.get(sku) ?? 0) + reorder * 2;
      assumedStock.push(sku);
    }
    products.push({
      sku,
      name: given?.name || demo?.name || sku,
      onHand,
      reorder,
      cost: given?.cost ?? demo!.cost,
      price: given?.price ?? lastPrice.get(sku)!.price,
      leadDays: demo?.leadDays ?? 7,
    });
    if ((prices.get(sku)?.size ?? 0) > 1) {
      warnings.push({ file: "orders", line: 0, column: "price", message: `SKU ${sku} sells at ${prices.get(sku)!.size} different prices. Each order keeps its own price; the latest becomes the company price for new orders.` });
    }
  }
  for (const sku of catalog.keys()) {
    if (!skusUsed.includes(sku)) warnings.push({ file: "products", line: 0, column: "sku", message: `SKU ${sku} is not used by any order, so it is ignored.` });
  }
  if (assumedStock.length) {
    notes.push(`Stock on hand was not given for ${assumedStock.join(", ")}. It is set to the units in open orders plus a reorder buffer, so no order is blocked.`);
  }

  /* ---- people: the demo team, with one media buyer standing in for every campaign */
  const usedClosers = new Set(parsed.map((p) => p.closer));
  const people: Person[] = base.people
    .filter((p) => p.role !== "buyer" || p.id === IMPORT_BUYER_ID)
    .map((p) => {
      if (p.id === IMPORT_BUYER_ID) return { ...p, name: IMPORT_BUYER_NAME, title: "Media buyer" };
      // Demo closers who sold nothing in the file are not charged a salary against the prospect's own data.
      if (newClosers.size > 0 && p.role === "closer" && !usedClosers.has(p.id)) return { ...p, monthlyBase: 0 };
      return p;
    })
    .concat([...newClosers.values()]);
  if (newClosers.size > 0) {
    notes.push(`Closers created from your file: ${[...newClosers.values()].map((p) => p.name).join(", ")}. Each gets the demo closer salary (₦${(closers[0]?.monthlyBase ?? 70000).toLocaleString()}/month) and reports to the demo team lead.`);
  }
  notes.push(
    `All orders are credited to one media buyer (${IMPORT_BUYER_NAME}, salary ₦${people.find((p) => p.id === IMPORT_BUYER_ID)!.monthlyBase.toLocaleString()}/month as in the demo). The team lead, salaries and pay rules are the demo's.`,
  );
  notes.push("Delivered and returned orders count in the week of their order date, with the cash treated as received. The file has no delivery dates.");

  /* ---- build the state by replaying each week through the same engine the app uses */
  const d: DemoState = {
    version: SEED_VERSION,
    people,
    products,
    orders: [],
    leads: [],
    cycles: [{ id: cycleIds[0], start: firstMonday, end: addDaysIso(firstMonday, 6), status: "open", carryIn: [] }],
    rules: { ...base.rules },
    rulesMeta: structuredClone(base.rulesMeta),
    spend: {},
    maxCostPerOrder: DEFAULT_MAX_COST_PER_ORDER,
    pos: [],
    audit: [],
    seq: 0,
  };

  try {
    const byWeek: Parsed[][] = Array.from({ length: weekCount }, () => []);
    for (const p of [...parsed].sort((a, b) => (a.date === b.date ? a.id - b.id : a.date < b.date ? -1 : 1))) byWeek[weekIndex(p.date)].push(p);

    for (let i = 0; i < weekCount; i++) {
      const cycle = cycleIds[i];
      d.spend[cycle] = { [IMPORT_BUYER_ID]: spendPerWeek[i] };
      for (const p of byWeek[i]) {
        const landed = p.stage === "delivered" || p.stage === "returned";
        const o: Order = {
          id: p.id,
          customer: p.customer,
          city: p.city,
          sku: p.sku,
          qty: p.qty,
          unitPrice: p.price,
          openedBy: p.closer,
          closer: p.closer,
          buyer: IMPORT_BUYER_ID,
          stage: p.stage,
          cashIn: landed,
          createdCycle: cycle,
          deliveredCycle: landed ? cycle : undefined,
          reversedCycle: p.stage === "returned" || p.stage === "cancelled" ? cycle : undefined,
          returnCondition: p.stage === "returned" ? "resellable" : undefined,
          ...(p.failed ? { failed: true } : {}),
          ...(p.campaign ? { campaign: p.campaign } : {}),
        };
        d.orders.push(o);
      }
      if (i < weekCount - 1) {
        const end = addDaysIso(firstMonday, i * 7 + 6);
        closeCycle(d, "chidinma", `${addDaysIso(end, 1)}T09:00:00+01:00`);
        markPaid(d, cycle, "chidinma", `${addDaysIso(end, 2)}T10:00:00+01:00`);
        if (i < weekCount - 2) lockCycle(d, cycle, "chidinma", `${addDaysIso(end, 8)}T08:00:00+01:00`);
        d.spend[cycleIds[i + 1]] = { [IMPORT_BUYER_ID]: spendPerWeek[i + 1] };
      }
    }
    const lastEnd = addDaysIso(lastMonday, 6);
    log(d, {
      at: `${lastEnd}T18:00:00+01:00`,
      actor: "chidinma",
      cycle: cycleIds[weekCount - 1],
      kind: "system",
      text: `Imported ${parsed.length} orders from CSV · ${weekCount} week${weekCount === 1 ? "" : "s"} (${cycleIds[0]}–${cycleIds[weekCount - 1]}) · stays in this browser`,
    });
  } catch (e) {
    errors.push({ file: "orders", line: 0, message: `The data could not be turned into pay cycles: ${e instanceof Error ? e.message : String(e)}` });
    return fail();
  }

  // Browsers keep about 5 MB per site. Stop here, with a clear message, rather than let the save fail silently later.
  const stored = JSON.stringify(d).length;
  if (stored > MAX_STORED_CHARS) {
    errors.push({ file: "orders", line: 0, message: `This data is too big to keep in your browser (${(stored / 1e6).toFixed(1)} MB; the limit is ${(MAX_STORED_CHARS / 1e6).toFixed(1)} MB). Try fewer orders or shorter customer and campaign names.` });
    return fail();
  }

  return {
    ok: true,
    state: d,
    summary: {
      orders: parsed.length,
      weeks: weekCount,
      firstWeek: cycleIds[0],
      openWeek: cycleIds[weekCount - 1],
      skus: skusUsed.length,
      adSpendTotal: spendTotal,
      notes,
      warnings,
    },
  };
}
