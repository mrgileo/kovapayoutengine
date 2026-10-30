"use client";

import { useEffect, useState } from "react";
import { Download, FileUp, ShieldCheck, X } from "lucide-react";
import { MAX_FILE_BYTES, MAX_ROWS, MAX_WEEKS, TEMPLATES, importData, type ImportIssue, type ImportResult } from "@/lib/importer";
import { downloadText as download } from "@/lib/download";
import { useStore } from "@/lib/store";
import { useMoney } from "./ui";

interface Picked {
  name: string;
  text: string;
}

const SHOWN_ERRORS = 40;

const where = (i: ImportIssue) => `${i.file} file${i.line ? `, line ${i.line}` : ""}${i.column ? `, ${i.column}` : ""}`;

/** Load your own orders from CSV. Files are read on this device and never sent anywhere. */
export function ImportDialog() {
  const open = useStore((s) => s.importOpen);
  const setOpen = useStore((s) => s.setImportOpen);
  const applyImport = useStore((s) => s.applyImport);
  const m = useMoney();

  const [orders, setOrders] = useState<Picked | null>(null);
  const [adSpend, setAdSpend] = useState<Picked | null>(null);
  const [products, setProducts] = useState<Picked | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  useEffect(() => {
    if (!open) return;
    setOrders(null);
    setAdSpend(null);
    setProducts(null);
    setReadError(null);
    setResult(null);
  }, [open]);

  useEffect(() => {
    if (!orders) {
      setResult(null);
      return;
    }
    setResult(importData({ orders: orders.text, adSpend: adSpend?.text, products: products?.text }));
  }, [orders, adSpend, products]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  if (!open) return null;

  async function pick(file: File | undefined, set: (p: Picked | null) => void) {
    setReadError(null);
    if (!file) {
      set(null);
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setReadError(`${file.name} is ${(file.size / 1048576).toFixed(1)} MB. The limit is ${MAX_FILE_BYTES / 1048576} MB.`);
      return;
    }
    try {
      set({ name: file.name, text: await file.text() });
    } catch {
      setReadError(`Could not read ${file.name}.`);
    }
  }

  const slot = (label: string, hint: string, file: Picked | null, set: (p: Picked | null) => void, id: string) => (
    <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 600 }}>
      <span>
        {label} <span className="muted" style={{ fontWeight: 400 }}>{hint}</span>
      </span>
      <input id={id} type="file" accept=".csv,text/csv" onChange={(e) => pick(e.target.files?.[0], set)} aria-label={label} />
      {file && <span className="muted mono" style={{ fontWeight: 400, fontSize: 11.5 }}>{file.name}</span>}
    </label>
  );

  const errors = result && !result.ok ? result.errors : [];
  const warnings = result ? (result.ok ? result.summary.warnings : result.warnings) : [];

  return (
    <>
      <div className="scrim" onClick={() => setOpen(false)} aria-hidden="true" />
      <div className="dialog" role="dialog" aria-modal="true" aria-label="Load your own data" style={{ width: "min(640px, calc(100vw - 28px))", maxHeight: "88dvh", overflow: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div className="eyebrow">Try it with your orders</div>
            <h2>Load your own data</h2>
          </div>
          <button type="button" className="btn xs ghost" onClick={() => setOpen(false)} aria-label="Close">
            <X size={14} />
          </button>
        </div>

        <div className="insight" style={{ marginTop: 10 }}>
          <ShieldCheck size={17} />
          <div>
            <b>Your data never leaves this browser.</b> The files are read on this device. Nothing is uploaded, and the demo data can be restored with one click.
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          <button type="button" className="btn sm" onClick={() => download("kova-orders-template.csv", TEMPLATES.orders)}>
            <Download size={13} /> Orders template
          </button>
          <button type="button" className="btn sm" onClick={() => download("kova-ad-spend-template.csv", TEMPLATES.adSpend)}>
            <Download size={13} /> Ad spend template
          </button>
          <button type="button" className="btn sm" onClick={() => download("kova-products-template.csv", TEMPLATES.products)}>
            <Download size={13} /> Products template
          </button>
        </div>

        <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
          {slot("Orders CSV", "(required)", orders, setOrders, "import-orders")}
          {slot("Ad spend CSV", "(optional: date, amount)", adSpend, setAdSpend, "import-adspend")}
          {slot("Products CSV", "(optional: sku, name, cost, on_hand. Needed for any SKU outside the demo catalogue)", products, setProducts, "import-products")}
        </div>

        <p style={{ marginTop: 12 }}>
          One row per order, price per unit, dates as 2026-10-27. Weeks run Monday to Sunday and the latest week is the open one (up to {MAX_WEEKS} weeks, {MAX_ROWS.toLocaleString()} orders). Closers must be Amaka or Chidi. Every order is credited to one media buyer.
        </p>

        {readError && (
          <div className="insight" role="alert" style={{ marginTop: 10 }}>
            <div>{readError}</div>
          </div>
        )}

        {result && !result.ok && (
          <div role="alert" style={{ marginTop: 12 }}>
            <b style={{ color: "var(--neg)", fontSize: 13 }}>
              {errors.length} problem{errors.length === 1 ? "" : "s"} to fix before this can load
            </b>
            <ul id="import-errors" style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 12.5, display: "grid", gap: 4 }}>
              {errors.slice(0, SHOWN_ERRORS).map((e, i) => (
                <li key={i}>
                  <span className="mono muted">{where(e)}:</span> {e.message}
                </li>
              ))}
            </ul>
            {errors.length > SHOWN_ERRORS && <p>…and {errors.length - SHOWN_ERRORS} more. Fix these and the rest will show.</p>}
          </div>
        )}

        {result?.ok && (
          <div style={{ marginTop: 12 }} id="import-ok">
            <b style={{ color: "var(--pos)", fontSize: 13 }}>Ready to load</b>
            <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 12.5, display: "grid", gap: 4 }}>
              <li>
                {result.summary.orders} orders across {result.summary.weeks} week{result.summary.weeks === 1 ? "" : "s"} ({result.summary.firstWeek} to {result.summary.openWeek}, with {result.summary.openWeek} open)
              </li>
              <li>
                {result.summary.skus} product{result.summary.skus === 1 ? "" : "s"}
                {result.summary.adSpendTotal > 0 ? ` · ad spend ${m(result.summary.adSpendTotal)}` : " · no ad spend file, so ad spend is zero"}
              </li>
              {result.summary.notes.map((n, i) => (
                <li key={i} className="muted">
                  {n}
                </li>
              ))}
            </ul>
          </div>
        )}

        {warnings.length > 0 && (
          <details style={{ marginTop: 10, fontSize: 12.5 }}>
            <summary>
              {warnings.length} note{warnings.length === 1 ? "" : "s"} (not blocking)
            </summary>
            <ul style={{ margin: "6px 0 0", paddingLeft: 18, display: "grid", gap: 4 }}>
              {warnings.slice(0, 20).map((w, i) => (
                <li key={i}>
                  <span className="mono muted">{where(w)}:</span> {w.message}
                </li>
              ))}
            </ul>
          </details>
        )}

        <div className="dialog-foot">
          <button type="button" className="btn ghost" onClick={() => setOpen(false)}>
            Cancel
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={!result?.ok}
            onClick={() => result?.ok && applyImport(result.state, result.summary)}
          >
            <FileUp size={14} /> Show my dashboard
          </button>
        </div>
      </div>
    </>
  );
}
