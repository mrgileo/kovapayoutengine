"use client";

import { useEffect, useMemo, useState } from "react";
import { canEditRules } from "@/lib/engine";
import { useData, useStore } from "@/lib/store";
import { askSetPrice } from "@/lib/askActions";
import { matchesQuery } from "@/lib/sort";
import { Card, useMoney } from "./ui";
import { NoMatches, ScrollTable, SortTh, TableTools, useSortable, type Col } from "./table";
import type { Product } from "@/lib/types";

function PriceRow({ p, editable }: { p: Product; editable: boolean }) {
  const m = useMoney();
  const setPrice = askSetPrice;
  const [draft, setDraft] = useState(String(p.price));
  useEffect(() => setDraft(String(p.price)), [p.price]);

  const commit = () => {
    const n = Number(draft);
    if (draft.trim() === "" || !Number.isFinite(n) || n <= 0) setDraft(String(p.price));
    else {
      setPrice(p.sku, n);
      setDraft(String(p.price)); // the price only changes once confirmed
    }
  };

  return (
    <tr>
      <td className="mono">
        <b>{p.sku}</b>
      </td>
      <td>{p.name}</td>
      <td className="r mono muted">{m(p.cost)}</td>
      <td className="r">
        {editable ? (
          <input
            type="number"
            inputMode="numeric"
            min={1}
            step={500}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            aria-label={`${p.sku} company price`}
            style={{ width: 110, padding: "5px 8px", borderRadius: 8, border: "1px solid var(--line-strong)", font: "inherit", textAlign: "right" }}
          />
        ) : (
          <b className="mono">{m(p.price)}</b>
        )}
      </td>
      <td className="r mono pos">{m(p.price - p.cost)}</td>
    </tr>
  );
}

/** One company price per SKU. Closers cannot change it; the founder can, and it only applies to new orders. */
export function PriceBook() {
  const data = useData();
  const role = useStore((s) => s.role);
  const editable = canEditRules(role);
  const [query, setQuery] = useState("");
  const shown = useMemo(() => data.products.filter((p) => matchesQuery(query, `${p.sku} ${p.name}`)), [data.products, query]);
  const cols: Col<Product>[] = [
    { key: "sku", label: "Code", get: (p) => p.sku },
    { key: "name", label: "Product", get: (p) => p.name },
    { key: "cost", label: "Product cost", get: (p) => p.cost, align: "r", first: "desc" },
    { key: "price", label: "Company price", get: (p) => p.price, align: "r", first: "desc" },
    { key: "gross", label: "Gross profit per unit", get: (p) => p.price - p.cost, align: "r", first: "desc" },
  ];
  const sorter = useSortable(shown, cols);

  return (
    <Card
      title="Company prices"
      sub={
        editable
          ? "Every order is priced at that product's company price × quantity. A change here only applies to new orders."
          : "Prices are set by the company. Closers cannot change them."
      }
      actions={data.products.length > 5 ? <TableTools query={query} onQuery={setQuery} sorter={sorter} label="Search products" placeholder="Search products…" /> : undefined}
      flush
    >
      {shown.length === 0 && query.trim() ? <NoMatches query={query} /> : null}
      <ScrollTable rows={9}>
        <table className="tbl">
          <thead>
            <tr>
              {cols.map((c) => (
                <SortTh key={c.key} s={sorter} col={c.key} />
              ))}
            </tr>
          </thead>
          <tbody>
            {sorter.sorted.map((p) => (
              <PriceRow key={p.sku} p={p} editable={editable} />
            ))}
          </tbody>
        </table>
      </ScrollTable>
    </Card>
  );
}
