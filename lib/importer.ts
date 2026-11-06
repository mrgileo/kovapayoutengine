// "Try it with your data": turn CSV files into a full DemoState, in the browser.
// Pure: no React, no storage, no network. The same engine that powers the demo recomputes everything.
//
// Starting data: orders (required) plus optional staff, products, leads, ad spend and purchase orders.
// With a staff file the company is built from your own people; without one it keeps the demo team and
// credits every order to one stand-in media buyer. With dated orders (delivered, cash received, returned)
// each event lands in the week it happened, and weeks are replayed through closeCycle -> markPaid -> lockCycle.

import type { AdSpendRow, DemoState, Lead, LeadSource, Order, Person, Product, PurchaseOrder, Role, Stage } from "./types.ts";
import { closeCycle, lockCycle, markPaid, log } from "./engine.ts";
import { DEFAULT_MAX_COST_PER_ORDER, SEED_VERSION, buildSeed } from "./seed.ts";

/* ------------------------------------------------------------------ public types */

export type ImportFile = "orders" | "ad spend" | "products" | "staff" | "leads" | "purchase orders" | "courier cash" | "stock count" | "bank statement" | "reported ad spend";

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
  staff: number;
  leads: number;
  adRows: number;
  purchaseOrders: number;
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
  staff?: string;
  leads?: string;
  purchaseOrders?: string;
}

/** Rows per file. A medium business books 1,000-2,000 orders a day, so two weeks is about 21,000 rows. */
export const MAX_ROWS = 60000;
export const MAX_WEEKS = 26;
export const MAX_FILE_BYTES = 15 * 1024 * 1024;
/** Size of the saved state, in characters, above which even IndexedDB persistence is not attempted. */
export const MAX_STORED_CHARS = 120_000_000;
const MAX_ERRORS = 200;

/** The one media buyer every imported order is credited to when there is no staff file. */
export const IMPORT_BUYER_ID = "tobi";
export const IMPORT_BUYER_NAME = "Imported Ads";

export const TEMPLATES = {
  orders: [
    "order_id,date,customer,city,sku,qty,unit_price,stage,delivered_date,cash_received_date,returned_date,cancelled_date,return_reason,return_condition,opened_by,closer,buyer,platform,campaign",
    "3001,2026-10-26,Ada Obi,Lagos,AIR-12,1,212000,delivered,2026-10-28,2026-10-30,,,,,closer01,closer01,buyer1,meta,October promo",
    "3002,2026-10-27,Musa Bello,Kano,KET-03,2,45000,delivered,2026-10-29,,,,,,closer02,closer02,buyer1,tiktok,October promo",
    "3003,2026-10-28,Ife Ade,Abuja,BLN-07,1,73500,returned,2026-10-30,,2026-11-02,,Changed mind,resellable,closer01,closer01,buyer1,meta,Retargeting",
    "3004,2026-11-02,Tola Eze,Lagos,VAC-21,1,187000,delivered,2026-11-04,2026-11-05,,,,,closer02,closer02,buyer1,x,October promo",
    "3005,2026-11-03,Emma Udo,Enugu,STM-09,1,112000,dispatched,,,,,,,closer01,closer01,buyer1,tiktok,",
    "3006,2026-11-04,Kemi Ola,Ibadan,AIR-12,1,212000,cancelled,,,,2026-11-04,,,closer02,closer02,buyer1,meta,Retargeting",
    "",
  ].join("\n"),
  adSpend: [
    "date,platform,account,campaign,buyer,spend,impressions,clicks,leads",
    "2026-10-26,meta,meta-acct-1,October promo,buyer1,40000,52000,1100,160",
    "2026-10-27,tiktok,tiktok-acct-1,October promo,buyer1,35000,61000,1400,120",
    "2026-11-02,x,x-acct-1,October promo,buyer1,15000,18000,300,40",
    "2026-11-03,meta,meta-acct-1,Retargeting,buyer1,30000,40000,900,95",
    "",
  ].join("\n"),
  products: [
    "sku,name,category,cost,price,on_hand,reorder_level,lead_days,supplier",
    "AIR-12,Air fryer 5.5L,Kitchen,78000,212000,6,3,7,Shenzhen Brightway",
    "BLN-07,Blender Pro 1200W,Kitchen,34000,73500,12,4,5,Guangzhou Unity",
    "KET-03,Electric kettle 1.7L,Kitchen,19500,45000,8,5,4,Guangzhou Unity",
    "VAC-21,Handheld vacuum,Home,96000,187000,5,3,10,Dubai Direct",
    "STM-09,Garment steamer,Home,52000,112000,9,3,6,Yiwu Trade Co",
    "",
  ].join("\n"),
  staff: [
    "id,name,role,title,monthly_base,commission_rate,reports_to",
    "founder,Chidinma Okoro,founder,Founder & CEO,0,,",
    "acc01,Bisi Adeyemi,accountant,Accountant,0,,",
    "lead1,Ngozi Eze,lead,Team lead,150000,,",
    "closer01,Amaka Obi,closer,Closer,70000,,lead1",
    "closer02,Chidi Nwosu,closer,Closer,70000,0.05,lead1",
    "buyer1,Tobi Ade,buyer,Media buyer,120000,,",
    "stock1,Dayo Aremu,stock,Inventory,0,,",
    "",
  ].join("\n"),
  leads: [
    "lead_id,date,name,phone,city,source,platform,campaign,status,reason,order_id",
    "9001,2026-11-02,Tola Eze,08031234567,Lagos,web_form,x,October promo,booked,,3004",
    "9002,2026-11-02,Samuel Eze,08051234567,Abuja,web_form,meta,Retargeting,lost,Never picked up the call,",
    "9003,2026-11-03,Emma Udo,08061234567,Enugu,whatsapp,tiktok,,booked,,3005",
    "9004,2026-11-04,Gift Udo,08071234567,Lagos,web_form,meta,Retargeting,open,,",
    "",
  ].join("\n"),
  purchaseOrders: [
    "po,sku,qty,unit_cost,raised_date,eta,status,received_date",
    "PO-0001,AIR-12,50,78000,2026-10-20,2026-10-27,received,2026-10-27",
    "PO-0002,VAC-21,30,96000,2026-11-01,2026-11-11,open,",
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
  lead_id: "lead_id",
  date: "date", order_date: "date",
  customer: "customer", customer_name: "customer",
  phone: "phone", customer_phone: "phone",
  city: "city",
  courier: "courier", delivery_partner: "courier",
  sku: "sku", product: "sku", product_sku: "sku",
  qty: "qty", quantity: "qty",
  price: "price", unit_price: "price",
  stage: "stage", status: "stage",
  delivered_date: "delivered_date", delivery_date: "delivered_date",
  cash_received_date: "cash_received_date", cash_date: "cash_received_date",
  returned_date: "returned_date", return_date: "returned_date",
  cancelled_date: "cancelled_date", canceled_date: "cancelled_date",
  return_reason: "return_reason",
  return_condition: "return_condition",
  opened_by: "opened_by", opener: "opened_by", first_touch: "opened_by",
  closer: "closer", sales_rep: "closer", rep: "closer",
  buyer: "buyer", media_buyer: "buyer",
  platform: "platform", ad_platform: "platform",
  campaign: "campaign",
};
const ORDER_REQUIRED = ["order_id", "date", "customer", "city", "sku", "qty", "price", "stage", "closer"];

const AD_COLUMNS: Record<string, string> = {
  date: "date", day: "date",
  amount: "spend", spend: "spend", ad_spend: "spend", cost: "spend",
  platform: "platform", channel: "platform",
  account: "account", ad_account: "account",
  campaign: "campaign",
  buyer: "buyer", media_buyer: "buyer",
  impressions: "impressions", clicks: "clicks", leads: "leads",
};
const PRODUCT_COLUMNS: Record<string, string> = {
  sku: "sku",
  name: "name", product: "name", product_name: "name",
  category: "category", type: "category", product_type: "category",
  cost: "cost", unit_cost: "cost", product_cost: "cost",
  on_hand: "on_hand", stock: "on_hand", onhand: "on_hand",
  price: "price", unit_price: "price",
  reorder_level: "reorder_level", reorder: "reorder_level", reorder_point: "reorder_level",
  lead_days: "lead_days", lead_time: "lead_days",
  supplier: "supplier",
};
const STAFF_COLUMNS: Record<string, string> = {
  id: "id", staff_id: "id",
  name: "name", full_name: "name",
  role: "role",
  title: "title",
  monthly_base: "monthly_base", base: "monthly_base", salary: "monthly_base", monthly_salary: "monthly_base",
  commission_rate: "commission_rate", commission: "commission_rate",
  reports_to: "reports_to", manager: "reports_to", team_lead: "reports_to",
};
const LEAD_COLUMNS: Record<string, string> = {
  lead_id: "lead_id", id: "lead_id",
  date: "date",
  name: "name", customer: "name", customer_name: "name",
  phone: "phone",
  city: "city",
  source: "source",
  platform: "platform",
  campaign: "campaign",
  status: "status",
  reason: "reason", lost_reason: "reason",
  order_id: "order_id",
};
const PO_COLUMNS: Record<string, string> = {
  po: "po", po_number: "po", id: "po",
  sku: "sku",
  qty: "qty", quantity: "qty",
  unit_cost: "unit_cost", cost: "unit_cost",
  raised_date: "raised_date", date: "raised_date",
  eta: "eta", expected: "eta",
  status: "status",
  received_date: "received_date",
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
const ROLES: Role[] = ["founder", "accountant", "lead", "closer", "buyer", "stock"];
const PLATFORMS: Record<string, string> = { meta: "meta", facebook: "meta", instagram: "meta", tiktok: "tiktok", x: "x", twitter: "x", google: "google", youtube: "google", snapchat: "snapchat", other: "other" };
const LEAD_SOURCES: Record<string, LeadSource> = { web_form: "web_form", form: "web_form", website: "web_form", whatsapp: "whatsapp", call: "call", phone: "call", instagram: "instagram" };

/* ------------------------------------------------------------------ dates & numbers */

export function parseDate(s: string): string | null {
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
export function parseNumber(s: string): number | null {
  const cleaned = s.replace(/[₦,\s]/g, "");
  if (cleaned === "" || !/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
}

/* ------------------------------------------------------------------ sheet reading */

export interface Sheet {
  rows: { line: number; get: (col: string) => string }[];
  has: (col: string) => boolean;
}

export function readSheet(
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
    errors.push({ file, line: 0, message: `Too many rows (${body.length.toLocaleString()}). The limit is ${MAX_ROWS.toLocaleString()}.` });
    return null;
  }
  return {
    has: (col: string) => col in index,
    rows: body.map((r) => ({
      line: r.line,
      get: (col: string) => (col in index ? (r.cells[index[col]] ?? "").trim() : ""),
    })),
  };
}

/* ------------------------------------------------------------------ main */

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
  opener: string;
  buyer: string;
  campaign: string;
  platform: string;
  courier: string;
  deliveredDate: string;
  cashDate: string;
  returnedDate: string;
  cancelledDate: string;
  returnReason: string;
  returnCondition: "resellable" | "damaged";
}

/** `onProgress` is told after each replayed week, so a screen can say "week 12 of 26" while a big company loads. */
export function importData(files: ImportFiles, onProgress?: (weeksDone: number, weeksTotal: number) => void): ImportResult {
  const errors: ImportIssue[] = [];
  const warnings: ImportIssue[] = [];
  const fail = (): ImportResult => ({ ok: false, errors: errors.slice(0, MAX_ERRORS), warnings });
  const err = (file: ImportFile, line: number, column: string | undefined, message: string) => {
    if (errors.length < MAX_ERRORS + 1) errors.push({ file, line, column, message });
  };
  const dateErr = (file: ImportFile, line: number, column: string, raw: string) =>
    err(file, line, column, `Date "${raw}" must look like 2026-10-27 (year-month-day).`);

  const base = buildSeed();
  const staffMode = Boolean(files.staff && files.staff.trim());

  /* ---- staff (optional): the company's own people */
  const staffList: Person[] = [];
  const personKey = new Map<string, Person>();
  if (staffMode) {
    const sheet = readSheet("staff", files.staff!, STAFF_COLUMNS, ["id", "name", "role"], errors, warnings);
    if (sheet) {
      const seenIds = new Map<string, number>();
      const reports: { person: Person; to: string; line: number }[] = [];
      for (const r of sheet.rows) {
        const start = errors.length;
        const id = r.get("id").toLowerCase().replace(/\s+/g, "-");
        if (!id) err("staff", r.line, "id", "Id is empty. Use a short unique id such as closer01.");
        else if (seenIds.has(id)) err("staff", r.line, "id", `Id ${id} is already used on line ${seenIds.get(id)}.`);
        else seenIds.set(id, r.line);
        const name = r.get("name");
        if (!name) err("staff", r.line, "name", "Name is empty.");
        const role = r.get("role").toLowerCase() as Role;
        if (!ROLES.includes(role)) err("staff", r.line, "role", `Role "${r.get("role")}" must be one of: ${ROLES.join(", ")}.`);
        let base_ = 0;
        if (r.get("monthly_base") !== "") {
          const n = parseNumber(r.get("monthly_base"));
          if (n === null || n < 0) err("staff", r.line, "monthly_base", `Monthly base "${r.get("monthly_base")}" must be a number, zero or more.`);
          else base_ = n;
        }
        let rate: number | undefined;
        if (r.get("commission_rate") !== "") {
          const n = parseNumber(r.get("commission_rate"));
          if (n === null || n < 0 || n > 1) err("staff", r.line, "commission_rate", `Commission rate "${r.get("commission_rate")}" must be a fraction from 0 to 1 (for example 0.04 for 4%).`);
          else rate = n;
        }
        if (errors.length === start) {
          const p: Person = { id, name, role, title: r.get("title") || role, monthlyBase: base_, ...(rate !== undefined ? { commissionRate: rate } : {}) };
          staffList.push(p);
          if (r.get("reports_to")) reports.push({ person: p, to: r.get("reports_to").toLowerCase(), line: r.line });
        }
      }
      for (const p of staffList) {
        personKey.set(p.id, p);
        personKey.set(p.name.toLowerCase(), p);
      }
      for (const r of reports) {
        const boss = personKey.get(r.to);
        if (!boss) err("staff", r.line, "reports_to", `Reports-to "${r.to}" is not a person in this file.`);
        else r.person.reportsTo = boss.id;
      }
    }
  }

  // Closers not in the demo team are created from the file when there is no staff file.
  const closers = base.people.filter((p) => p.role === "closer");
  const closerKey = new Map<string, Person>();
  for (const c of closers) {
    closerKey.set(c.id.toLowerCase(), c);
    closerKey.set(c.name.toLowerCase(), c);
    closerKey.set(c.name.split(" ")[0].toLowerCase(), c);
  }
  const MAX_NEW_CLOSERS = 12;
  const newClosers = new Map<string, Person>();
  const closerFor = (raw: string): Person | null => {
    const typed = raw.trim().replace(/\s+/g, " ");
    if (!typed) return null;
    if (staffMode) {
      const p = personKey.get(typed.toLowerCase());
      return p && p.role === "closer" ? p : null;
    }
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
  const buyerFor = (raw: string): Person | null => {
    const p = personKey.get(raw.trim().toLowerCase());
    return p && p.role === "buyer" ? p : null;
  };
  if (errors.length > 0) return fail();

  /* ---- products (optional) */
  interface Cat {
    name?: string;
    cost?: number;
    onHand?: number;
    price?: number;
    reorder?: number;
    leadDays?: number;
    category?: string;
    supplier?: string;
  }
  const catalog = new Map<string, Cat>();
  if (files.products && files.products.trim()) {
    const sheet = readSheet("products", files.products, PRODUCT_COLUMNS, ["sku", "cost"], errors, warnings);
    if (sheet) {
      for (const r of sheet.rows) {
        const start = errors.length;
        const sku = r.get("sku").toUpperCase();
        if (!sku) err("products", r.line, "sku", "SKU is empty.");
        else if (catalog.has(sku)) err("products", r.line, "sku", `SKU ${sku} appears twice.`);
        const cost = parseNumber(r.get("cost"));
        if (cost === null || cost < 0) err("products", r.line, "cost", `Cost "${r.get("cost")}" is not a number.`);
        const entry: Cat = { cost: cost ?? undefined, name: r.get("name") || undefined, category: r.get("category") || undefined, supplier: r.get("supplier") || undefined };
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
        if (r.get("reorder_level") !== "") {
          const n = parseNumber(r.get("reorder_level"));
          if (n === null || n < 0 || !Number.isInteger(n)) err("products", r.line, "reorder_level", `Reorder level "${r.get("reorder_level")}" must be a whole number.`);
          else entry.reorder = n;
        }
        if (r.get("lead_days") !== "") {
          const n = parseNumber(r.get("lead_days"));
          if (n === null || n < 0 || !Number.isInteger(n)) err("products", r.line, "lead_days", `Lead days "${r.get("lead_days")}" must be a whole number.`);
          else entry.leadDays = n;
        }
        if (sku && errors.length === start) catalog.set(sku, entry);
        else if (sku && !catalog.has(sku)) catalog.set(sku, entry); // keep the sku known so orders do not add a second, misleading error
      }
    }
  }

  /* ---- orders */
  const sheet = readSheet("orders", files.orders ?? "", ORDER_COLUMNS, staffMode ? [...ORDER_REQUIRED, "buyer"] : ORDER_REQUIRED, errors, warnings);
  if (!sheet) return fail();
  const dated = sheet.has("delivered_date") || sheet.has("cash_received_date") || sheet.has("returned_date") || sheet.has("cancelled_date");

  const parsed: Parsed[] = [];
  const seen = new Map<number, number>();
  let missingDeliveredDate = 0;
  for (const r of sheet.rows) {
    const start = errors.length;
    const idRaw = r.get("order_id").replace(/^#/, "");
    const id = parseNumber(idRaw);
    if (id === null || !Number.isInteger(id) || id <= 0) err("orders", r.line, "order_id", `Order id "${r.get("order_id")}" must be a whole number above zero.`);
    else if (seen.has(id)) err("orders", r.line, "order_id", `Order id ${id} is already used on line ${seen.get(id)}.`);
    else seen.set(id, r.line);

    const date = parseDate(r.get("date"));
    if (!date) dateErr("orders", r.line, "date", r.get("date"));

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
    if (!closer)
      err(
        "orders",
        r.line,
        "closer",
        staffMode
          ? `Closer "${r.get("closer")}" is not a closer in the staff file.`
          : r.get("closer").trim()
            ? `More than ${MAX_NEW_CLOSERS} different closer names. Check the closer column for typos.`
            : "The closer is empty. Put the name of the person who sold the order.",
      );
    let opener = closer;
    if (r.get("opened_by")) {
      opener = closerFor(r.get("opened_by"));
      if (!opener) err("orders", r.line, "opened_by", `Opened-by "${r.get("opened_by")}" is not a closer ${staffMode ? "in the staff file" : "name"}.`);
    }
    let buyerId = IMPORT_BUYER_ID;
    if (staffMode) {
      const b = buyerFor(r.get("buyer"));
      if (!b) err("orders", r.line, "buyer", `Buyer "${r.get("buyer")}" is not a media buyer in the staff file.`);
      else buyerId = b.id;
    }

    const optDate = (col: string): string => {
      const raw = r.get(col);
      if (raw === "") return "";
      const d = parseDate(raw);
      if (!d) {
        dateErr("orders", r.line, col, raw);
        return "";
      }
      if (date && d < date) err("orders", r.line, col, `${col.replace(/_/g, " ")} ${d} is before the order date ${date}.`);
      return d;
    };
    const deliveredDate = optDate("delivered_date");
    const cashDate = optDate("cash_received_date");
    const returnedDate = optDate("returned_date");
    const cancelledDate = optDate("cancelled_date");
    const cond = r.get("return_condition").toLowerCase();
    if (cond && cond !== "resellable" && cond !== "damaged") err("orders", r.line, "return_condition", `Return condition "${r.get("return_condition")}" must be resellable or damaged.`);

    let plat = "";
    if (r.get("platform")) {
      plat = PLATFORMS[r.get("platform").toLowerCase()] ?? "";
      if (!plat) err("orders", r.line, "platform", `Platform "${r.get("platform")}" must be one of: meta, tiktok, x, google, snapchat, other.`);
    }

    if (errors.length === start && id !== null && date && qty !== null && price !== null && st && closer && opener) {
      if (dated && (st.stage === "delivered" || st.stage === "returned") && !deliveredDate) missingDeliveredDate++;
      parsed.push({
        line: r.line,
        id,
        date,
        customer,
        city,
        sku,
        qty,
        price,
        stage: st.stage,
        failed: Boolean(st.failed),
        closer: closer.id,
        opener: opener.id,
        buyer: buyerId,
        campaign: r.get("campaign"),
        platform: plat,
        courier: r.get("courier"),
        deliveredDate,
        cashDate,
        returnedDate,
        cancelledDate,
        returnReason: r.get("return_reason"),
        returnCondition: cond === "damaged" ? "damaged" : "resellable",
      });
    }
  }

  /* ---- SKUs need a product cost: from the products file, or the demo catalogue */
  const demoBySku = new Map(base.products.map((p) => [p.sku, p]));
  const firstLineOf = new Map<string, number>();
  for (const p of parsed) if (!firstLineOf.has(p.sku)) firstLineOf.set(p.sku, p.line);
  for (const [sku, line] of firstLineOf) {
    if (catalog.get(sku)?.cost === undefined && !demoBySku.has(sku)) {
      err("orders", line, "sku", `SKU ${sku} has no product cost. Add it to the products file (columns: sku, name, cost, on_hand) so profit is not overstated.`);
    }
  }
  const skusUsed = [...firstLineOf.keys()];
  if (errors.length > 0) return fail();

  /* ---- ad spend (optional): a platform export per day, or just date + amount */
  const adRows: AdSpendRow[] = [];
  let legacySpend = false;
  const spendByDate: { date: string; amount: number; line: number; buyer: string }[] = [];
  if (files.adSpend && files.adSpend.trim()) {
    const first = parseCsv(files.adSpend)[0]?.cells.map(norm) ?? [];
    legacySpend = !(first.includes("platform") || first.includes("channel") || first.includes("buyer") || first.includes("media_buyer"));
    const ad = readSheet("ad spend", files.adSpend, AD_COLUMNS, legacySpend ? ["date", "spend"] : ["date", "platform", "spend"], errors, warnings);
    if (ad) {
      for (const r of ad.rows) {
        const start = errors.length;
        const date = parseDate(r.get("date"));
        const amount = parseNumber(r.get("spend"));
        if (!date) dateErr("ad spend", r.line, "date", r.get("date"));
        if (amount === null || amount < 0) err("ad spend", r.line, "spend", `Spend "${r.get("spend")}" must be a number, zero or more.`);
        let plat = "other";
        let buyerId = IMPORT_BUYER_ID;
        if (!legacySpend) {
          const rawPlat = r.get("platform").toLowerCase();
          plat = PLATFORMS[rawPlat] ?? "";
          if (!plat) err("ad spend", r.line, "platform", `Platform "${r.get("platform")}" must be one of: meta, tiktok, x, google, snapchat, other.`);
          if (staffMode) {
            const b = buyerFor(r.get("buyer"));
            if (!b) err("ad spend", r.line, "buyer", `Buyer "${r.get("buyer")}" is not a media buyer in the staff file.`);
            else buyerId = b.id;
          }
        }
        if (errors.length === start && date && amount !== null) {
          spendByDate.push({ date, amount, line: r.line, buyer: buyerId });
          const num = (c: string) => {
            const n = parseNumber(r.get(c));
            return n !== null && n >= 0 ? n : undefined;
          };
          adRows.push({ date, platform: plat, buyer: buyerId, campaign: r.get("campaign"), account: r.get("account") || undefined, spend: amount, impressions: num("impressions"), clicks: num("clicks"), leads: num("leads") });
        }
      }
    }
  }
  if (errors.length > 0) return fail();

  /* ---- weeks (Monday to Sunday): from the first order to the last thing that happened */
  let firstDate = parsed[0].date;
  let lastDate = parsed[0].date;
  for (const p of parsed) {
    for (const x of [p.date, p.deliveredDate, p.cashDate, p.returnedDate, p.cancelledDate]) {
      if (!x) continue;
      if (x < firstDate) firstDate = x;
      if (x > lastDate) lastDate = x;
    }
  }
  const firstMonday = mondayOf(firstDate);
  const lastMonday = mondayOf(lastDate);
  const weekCount = daysBetween(firstMonday, lastMonday) / 7 + 1;
  if (weekCount > MAX_WEEKS) {
    err("orders", 0, "date", `The dates span ${weekCount} weeks. The limit is ${MAX_WEEKS}. Split the file or trim the oldest rows.`);
    return fail();
  }
  const firstNumber = isoWeekNumber(firstMonday);
  const cycleIds = Array.from({ length: weekCount }, (_, i) => `W${firstNumber + i}`);
  const weekCache = new Map<string, number>();
  const weekIndex = (iso: string) => {
    let w = weekCache.get(iso);
    if (w === undefined) weekCache.set(iso, (w = daysBetween(firstMonday, mondayOf(iso)) / 7));
    return w;
  };

  const spendPerWeek: Record<string, number>[] = Array.from({ length: weekCount }, () => ({}));
  let spendTotal = 0;
  const keptAd: AdSpendRow[] = [];
  const adLineOf = new Map(adRows.map((r, i) => [r, spendByDate[i]]));
  for (const row of adRows) {
    const s = adLineOf.get(row)!;
    const wi = weekIndex(s.date);
    if (wi < 0 || wi >= weekCount) {
      warnings.push({ file: "ad spend", line: s.line, column: "date", message: `${s.date} is outside the weeks covered by the orders, so it is ignored.` });
      continue;
    }
    spendPerWeek[wi][s.buyer] = (spendPerWeek[wi][s.buyer] ?? 0) + s.amount;
    spendTotal += s.amount;
    keptAd.push(row);
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
    let set = prices.get(p.sku);
    if (!set) prices.set(p.sku, (set = new Set()));
    set.add(p.price);
  }
  const products: Product[] = [];
  const assumedStock: string[] = [];
  const multiPrice: string[] = [];
  const productSkus = staffMode || catalog.size > 0 ? [...new Set([...catalog.keys(), ...skusUsed])] : skusUsed;
  for (const sku of productSkus) {
    const demo = demoBySku.get(sku);
    const given = catalog.get(sku);
    const reorder = given?.reorder ?? demo?.reorder ?? 3;
    let onHand = given?.onHand;
    if (onHand === undefined) {
      onHand = (openUnits.get(sku) ?? 0) + reorder * 2;
      assumedStock.push(sku);
    }
    const price = given?.price ?? lastPrice.get(sku)?.price ?? demo?.price ?? 0;
    products.push({
      sku,
      name: given?.name || demo?.name || sku,
      onHand,
      reorder,
      cost: given?.cost ?? demo!.cost,
      price,
      leadDays: given?.leadDays ?? demo?.leadDays ?? 7,
      ...(given?.category ? { category: given.category } : {}),
      ...(given?.supplier ? { supplier: given.supplier } : {}),
    });
    if ((prices.get(sku)?.size ?? 0) > 1) multiPrice.push(sku);
  }
  if (multiPrice.length) {
    warnings.push({
      file: "orders",
      line: 0,
      column: "price",
      message: `${multiPrice.length === 1 ? `SKU ${multiPrice[0]} sells` : `${multiPrice.length} SKUs sell`} at more than one price${multiPrice.length > 1 ? ` (${multiPrice.slice(0, 5).join(", ")}${multiPrice.length > 5 ? ", …" : ""})` : ""}. Each order keeps its own price; the latest becomes the company price for new orders.`,
    });
  }
  for (const sku of catalog.keys()) {
    if (!skusUsed.includes(sku) && !staffMode && warnings.length < MAX_ERRORS) warnings.push({ file: "products", line: 0, column: "sku", message: `SKU ${sku} is not used by any order, so it is ignored.` });
  }
  if (assumedStock.length) {
    notes.push(`Stock on hand was not given for ${assumedStock.length > 6 ? `${assumedStock.length} products` : assumedStock.join(", ")}. It is set to the units in open orders plus a reorder buffer, so no order is blocked.`);
  }
  const productBySku = new Map(products.map((p) => [p.sku, p]));

  /* ---- people */
  let people: Person[];
  let founderId = "chidinma";
  if (staffMode) {
    people = staffList.slice();
    // Any role the file does not cover gets the demo person, so every view still has someone to be.
    for (const role of ROLES) {
      if (!people.some((p) => p.role === role)) {
        const demo = base.people.find((p) => p.role === role);
        if (demo) {
          people.push({ ...demo, reportsTo: undefined, monthlyBase: 0 });
          notes.push(`No ${role} in the staff file, so ${demo.name} (demo) stands in as the ${role}.`);
        }
      }
    }
    founderId = people.find((p) => p.role === "founder")!.id;
    notes.push(`${staffList.length} people loaded from your staff file; pay uses their monthly base and commission (company rates unless a person has their own).`);
  } else {
    const usedClosers = new Set(parsed.map((p) => p.closer));
    people = base.people
      .filter((p) => p.role !== "buyer" || p.id === IMPORT_BUYER_ID)
      .map((p) => {
        if (p.id === IMPORT_BUYER_ID) return { ...p, name: IMPORT_BUYER_NAME, title: "Media buyer" };
        if (newClosers.size > 0 && p.role === "closer" && !usedClosers.has(p.id)) return { ...p, monthlyBase: 0 };
        return p;
      })
      .concat([...newClosers.values()]);
    if (newClosers.size > 0) {
      notes.push(`Closers created from your file: ${[...newClosers.values()].map((p) => p.name).join(", ")}. Each gets the demo closer salary (₦${(closers[0]?.monthlyBase ?? 70000).toLocaleString()}/month) and reports to the demo team lead.`);
    }
    notes.push(
      `All orders are credited to one media buyer (${IMPORT_BUYER_NAME}, salary ₦${people.find((p) => p.id === IMPORT_BUYER_ID)!.monthlyBase.toLocaleString()}/month as in the demo). Add a staff file to use your own people. The team lead, salaries and pay rules are the demo's.`,
    );
  }
  if (dated) {
    if (missingDeliveredDate > 0) notes.push(`${missingDeliveredDate.toLocaleString()} delivered or returned orders have no delivered_date, so they count as delivered on their order date.`);
  } else {
    notes.push("Delivered and returned orders count in the week of their order date, with the cash treated as received. The file has no delivery dates.");
  }

  /* ---- starting stock: replaying deliveries and resellable returns must end at the on-hand numbers given */
  const netOut = new Map<string, number>();
  for (const p of parsed) {
    if (p.stage === "delivered") netOut.set(p.sku, (netOut.get(p.sku) ?? 0) + p.qty);
    else if (p.stage === "returned" && p.returnCondition === "damaged") netOut.set(p.sku, (netOut.get(p.sku) ?? 0) + p.qty);
  }
  const finalOnHand = new Map(products.map((p) => [p.sku, p.onHand]));
  for (const p of products) p.onHand += netOut.get(p.sku) ?? 0;

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
    adSpend: keptAd,
    maxCostPerOrder: DEFAULT_MAX_COST_PER_ORDER,
    pos: [],
    audit: [],
    seq: 0,
  };
  if (staffMode) for (const k of Object.keys(d.rulesMeta) as (keyof typeof d.rulesMeta)[]) d.rulesMeta[k] = { ...d.rulesMeta[k], by: founderId };

  try {
    // Events by week: orders are created in the week of their date; deliveries, cash, returns and cancellations land in the week they happened.
    const created: Parsed[][] = Array.from({ length: weekCount }, () => []);
    type Ev = { p: Parsed; o: Order };
    const evs = Array.from({ length: weekCount }, () => ({ deliver: [] as Ev[], fail: [] as Ev[], cancel: [] as Ev[], cash: [] as Ev[], ret: [] as Ev[] }));
    const sorted = [...parsed].sort((a, b) => (a.date === b.date ? a.id - b.id : a.date < b.date ? -1 : 1));
    for (const p of sorted) created[weekIndex(p.date)].push(p);

    for (let i = 0; i < weekCount; i++) {
      const cycle = cycleIds[i];
      d.spend[cycle] = spendPerWeek[i];
      for (const p of created[i]) {
        const open = p.stage === "new" || p.stage === "confirmed" || p.stage === "dispatched";
        const o: Order = {
          id: p.id,
          customer: p.customer,
          city: p.city,
          sku: p.sku,
          qty: p.qty,
          unitPrice: p.price,
          openedBy: p.opener,
          closer: p.closer,
          buyer: p.buyer,
          stage: open ? p.stage : p.stage === "cancelled" ? "confirmed" : "dispatched",
          cashIn: false,
          createdCycle: cycle,
          ...(p.campaign ? { campaign: p.campaign } : {}),
          ...(p.platform ? { platform: p.platform } : {}),
          ...(p.courier ? { courier: p.courier } : {}),
          ...(p.returnReason ? { returnReason: p.returnReason } : {}),
        };
        d.orders.push(o);
        const week = (date: string) => Math.min(weekCount - 1, Math.max(i, date ? weekIndex(date) : i));
        const e = { p, o };
        if (p.stage === "delivered" || p.stage === "returned") {
          const dw = week(p.deliveredDate);
          evs[dw].deliver.push(e);
          if (!dated) evs[dw].cash.push(e); // no dates: the cash is treated as received
          else if (p.stage === "delivered" && p.cashDate) evs[week(p.cashDate)].cash.push(e);
          if (p.stage === "returned") evs[week(p.returnedDate || p.deliveredDate)].ret.push(e);
        } else if (p.stage === "cancelled") (p.failed ? evs[week(p.cancelledDate)].fail : evs[week(p.cancelledDate)].cancel).push(e);
      }
      const w = evs[i];
      for (const { p, o } of w.deliver) {
        o.stage = "delivered";
        o.deliveredCycle = cycle;
        productBySku.get(o.sku)!.onHand -= o.qty;
        void p;
      }
      for (const { o } of w.fail) {
        o.stage = "cancelled";
        o.failed = true;
        o.reversedCycle = cycle;
      }
      for (const { o } of w.cancel) {
        o.stage = "cancelled";
        o.reversedCycle = cycle;
      }
      for (const { o } of w.cash) o.cashIn = true;
      for (const { p, o } of w.ret) {
        o.stage = "returned";
        o.reversedCycle = cycle;
        o.returnCondition = p.returnCondition;
        if (p.returnCondition === "resellable") productBySku.get(o.sku)!.onHand += o.qty;
        if (!dated) o.cashIn = true;
      }
      if (i < weekCount - 1) {
        const end = addDaysIso(firstMonday, i * 7 + 6);
        closeCycle(d, founderId, `${addDaysIso(end, 1)}T09:00:00+01:00`);
        markPaid(d, cycle, founderId, `${addDaysIso(end, 2)}T10:00:00+01:00`);
        if (i < weekCount - 2) lockCycle(d, cycle, founderId, `${addDaysIso(end, 8)}T08:00:00+01:00`);
        d.spend[cycleIds[i + 1]] = spendPerWeek[i + 1];
      }
      onProgress?.(i + 1, weekCount);
    }
    // Replaying can leave a product a unit or two away from the number the file gave. Put the file's number back.
    for (const p of products) p.onHand = finalOnHand.get(p.sku)!;
    const lastEnd = addDaysIso(lastMonday, 6);
    log(d, {
      at: `${lastEnd}T18:00:00+01:00`,
      actor: founderId,
      cycle: cycleIds[weekCount - 1],
      kind: "system",
      text: `Imported ${parsed.length.toLocaleString()} orders from CSV · ${weekCount} week${weekCount === 1 ? "" : "s"} (${cycleIds[0]}–${cycleIds[weekCount - 1]}) · stays in this browser`,
    });
  } catch (e) {
    errors.push({ file: "orders", line: 0, message: `The data could not be turned into pay cycles: ${e instanceof Error ? e.message : String(e)}` });
    return fail();
  }

  /* ---- leads (optional) */
  let leadCount = 0;
  if (files.leads && files.leads.trim()) {
    const sheetL = readSheet("leads", files.leads, LEAD_COLUMNS, ["lead_id", "date", "name", "status"], errors, warnings);
    if (sheetL) {
      const orderIds = new Set(parsed.map((p) => p.id));
      const seenLead = new Map<number, number>();
      const leadsOut: Lead[] = [];
      let outside = 0;
      for (const r of sheetL.rows) {
        const start = errors.length;
        const id = parseNumber(r.get("lead_id"));
        if (id === null || !Number.isInteger(id) || id <= 0) err("leads", r.line, "lead_id", `Lead id "${r.get("lead_id")}" must be a whole number above zero.`);
        else if (seenLead.has(id)) err("leads", r.line, "lead_id", `Lead id ${id} is already used on line ${seenLead.get(id)}.`);
        else seenLead.set(id, r.line);
        const date = parseDate(r.get("date"));
        if (!date) dateErr("leads", r.line, "date", r.get("date"));
        const status = r.get("status").toLowerCase();
        if (status !== "open" && status !== "booked" && status !== "lost") err("leads", r.line, "status", `Status "${r.get("status")}" must be open, booked or lost.`);
        const source = r.get("source") ? LEAD_SOURCES[r.get("source").toLowerCase()] : "web_form";
        if (!source) err("leads", r.line, "source", `Source "${r.get("source")}" must be one of: web_form, whatsapp, call, instagram.`);
        let orderId: number | undefined;
        if (r.get("order_id") !== "") {
          const o = parseNumber(r.get("order_id").replace(/^#/, ""));
          if (o === null || !orderIds.has(o)) err("leads", r.line, "order_id", `Order ${r.get("order_id")} is not in the orders file.`);
          else orderId = o;
        } else if (status === "booked") err("leads", r.line, "order_id", "A booked lead needs the order it became.");
        let platform = "";
        if (r.get("platform")) {
          platform = PLATFORMS[r.get("platform").toLowerCase()] ?? "";
          if (!platform) err("leads", r.line, "platform", `Platform "${r.get("platform")}" must be one of: meta, tiktok, x, google, snapchat, other.`);
        }
        if (errors.length === start && id !== null && date && source) {
          const wi = weekIndex(date);
          if (wi < 0 || wi >= weekCount) {
            outside++;
            continue;
          }
          leadsOut.push({
            id,
            cycle: cycleIds[wi],
            customer: r.get("name"),
            city: r.get("city"),
            source,
            ...(r.get("campaign") ? { campaign: r.get("campaign") } : {}),
            ...(platform ? { platform } : {}),
            status: status as Lead["status"],
            ...(r.get("reason") ? { reason: r.get("reason") } : {}),
            ...(orderId !== undefined ? { orderId } : {}),
          });
        }
      }
      if (outside) warnings.push({ file: "leads", line: 0, column: "date", message: `${outside.toLocaleString()} leads are outside the weeks covered by the orders, so they are ignored.` });
      d.leads = leadsOut;
      leadCount = leadsOut.length;
    }
  }

  /* ---- purchase orders (optional) */
  if (files.purchaseOrders && files.purchaseOrders.trim()) {
    const sheetP = readSheet("purchase orders", files.purchaseOrders, PO_COLUMNS, ["po", "sku", "qty", "unit_cost", "status"], errors, warnings);
    if (sheetP) {
      const stockPerson = people.find((p) => p.role === "stock")?.id ?? founderId;
      const seenPo = new Map<string, number>();
      for (const r of sheetP.rows) {
        const start = errors.length;
        const po = r.get("po");
        if (!po) err("purchase orders", r.line, "po", "PO number is empty.");
        else if (seenPo.has(po)) err("purchase orders", r.line, "po", `PO ${po} is already used on line ${seenPo.get(po)}.`);
        else seenPo.set(po, r.line);
        const sku = r.get("sku").toUpperCase();
        if (!productBySku.has(sku)) err("purchase orders", r.line, "sku", `SKU ${sku || "(empty)"} is not a product.`);
        const qty = parseNumber(r.get("qty"));
        if (qty === null || !Number.isInteger(qty) || qty < 1) err("purchase orders", r.line, "qty", `Quantity "${r.get("qty")}" must be a whole number above zero.`);
        const unitCost = parseNumber(r.get("unit_cost"));
        if (unitCost === null || unitCost < 0) err("purchase orders", r.line, "unit_cost", `Unit cost "${r.get("unit_cost")}" must be a number, zero or more.`);
        const raised = r.get("raised_date") ? parseDate(r.get("raised_date")) : lastDateOf(d);
        if (!raised) dateErr("purchase orders", r.line, "raised_date", r.get("raised_date"));
        const eta = r.get("eta") ? parseDate(r.get("eta")) : raised;
        if (!eta) dateErr("purchase orders", r.line, "eta", r.get("eta"));
        const status = r.get("status").toLowerCase();
        if (status !== "open" && status !== "received") err("purchase orders", r.line, "status", `Status "${r.get("status")}" must be open or received.`);
        const rec = r.get("received_date") ? parseDate(r.get("received_date")) : undefined;
        if (r.get("received_date") && !rec) dateErr("purchase orders", r.line, "received_date", r.get("received_date"));
        if (errors.length === start && qty !== null && unitCost !== null && raised && eta) {
          const x: PurchaseOrder = { id: po, sku, qty, unitCost, raisedAt: raised, raisedBy: stockPerson, eta, status: status as "open" | "received", ...(rec ? { receivedAt: rec } : {}) };
          d.pos.push(x);
        }
      }
    }
  }
  if (errors.length > 0) return fail();

  return {
    ok: true,
    state: d,
    summary: {
      orders: parsed.length,
      weeks: weekCount,
      firstWeek: cycleIds[0],
      openWeek: cycleIds[weekCount - 1],
      skus: products.length,
      adSpendTotal: spendTotal,
      staff: staffMode ? staffList.length : 0,
      leads: leadCount,
      adRows: keptAd.length,
      purchaseOrders: d.pos.length,
      notes,
      warnings,
    },
  };
}

/** The last day of the open week: the default for a date the file leaves out. */
function lastDateOf(d: DemoState): string {
  const open = d.cycles.find((c) => c.status === "open");
  return open ? open.end : addDaysIso(new Date().toISOString().slice(0, 10), 0);
}
