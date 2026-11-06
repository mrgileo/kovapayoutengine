// Adds bank_statement.csv to a generated dataset. It needs the real engine (to know what each person is owed
// for the last closed week), so it is kept apart from data-gen.mjs, which has no dependencies.
// Needs Node 22.18+ (or any Node with TypeScript type stripping), because the engine is TypeScript.

import { importData } from "../lib/importer.ts";
import { cycleLines, payslip, salesPeople } from "../lib/engine.ts";

const csvCell = (v) => {
  const s = v === undefined || v === null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const addDays = (iso, n) => {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export async function addBankStatement(set) {
  const f = set.files;
  const res = importData({
    orders: f["orders.csv"],
    staff: f["staff.csv"],
    products: f["products.csv"],
    adSpend: f["ad_spend.csv"],
    purchaseOrders: f["purchase_orders.csv"],
  });
  if (!res.ok) throw new Error("Could not read the generated files back: " + JSON.stringify(res.errors.slice(0, 3)));
  const st = res.state;
  const closed = [...st.cycles].filter((c) => c.status !== "open").pop();
  const header = ["date", "reference", "description", "debit", "credit", "payee"];
  if (!closed) {
    f["bank_statement.csv"] = header.join(",") + "\n";
    set.expected.planted.bank = { cycle: null };
    return;
  }
  const lines = cycleLines(st, closed.id);
  const owed = salesPeople(st)
    .map((p) => ({ p, due: Math.round(payslip(lines, p.id).payable) }))
    .filter((x) => x.due > 0);

  // Planted problems, chosen by position so every run is the same.
  const missing = [owed[3], owed[10]].filter(Boolean);
  const wrong = owed[5];
  const dup = owed[8];
  const payDate = addDays(closed.end, 2);
  const rows = [];
  for (const { p, due } of owed) {
    if (missing.some((m) => m.p.id === p.id)) continue;
    const debit = wrong && wrong.p.id === p.id ? due - 1500 : due;
    rows.push([payDate, `PAY-${closed.id}-${p.id}`, `Salary and commission ${closed.id}`, debit, "", p.name]);
    if (dup && dup.p.id === p.id) rows.push([addDays(payDate, 1), `PAY-${closed.id}-${p.id}`, `Salary and commission ${closed.id}`, due, "", p.name]);
  }
  rows.push([addDays(payDate, 1), "INV-77120", "Packaging supplies", 250000, "", "Dangote Packaging Ltd"]); // not a person owed pay
  rows.push([addDays(closed.end, 1), "REM-KWIK-WEEK", "Courier remittance", "", 4850000, "Kwik Delivery"]); // credits are noise, not payouts
  rows.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

  f["bank_statement.csv"] = [header.join(","), ...rows.map((r) => r.map(csvCell).join(","))].join("\n") + "\n";
  set.expected.planted.bank = {
    cycle: closed.id,
    expectedTotal: owed.reduce((a, x) => a + x.due, 0),
    people: owed.length,
    missing: missing.map((m) => m.p.id),
    wrongAmount: wrong ? { [wrong.p.id]: -1500 } : {},
    duplicate: dup ? [dup.p.id] : [],
    unknownPayees: 1,
  };
}
