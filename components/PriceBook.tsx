"use client";

import { useEffect, useState } from "react";
import { canEditRules } from "@/lib/engine";
import { useData, useStore } from "@/lib/store";
import { Card, useMoney } from "./ui";
import type { Product } from "@/lib/types";

function PriceRow({ p, editable }: { p: Product; editable: boolean }) {
  const m = useMoney();
  const setPrice = useStore((s) => s.setProductPrice);
  const [draft, setDraft] = useState(String(p.price));
  useEffect(() => setDraft(String(p.price)), [p.price]);

  const commit = () => {
    const n = Number(draft);
    if (draft.trim() === "" || !Number.isFinite(n) || n <= 0) setDraft(String(p.price));
    else setPrice(p.sku, n);
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

  return (
    <Card
      title="Company prices"
      sub={
        editable
          ? "Every order is priced at that product's company price × quantity. A change here only applies to new orders."
          : "Prices are set by the company. Closers cannot change them."
      }
      flush
    >
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Code</th>
              <th>Product</th>
              <th className="r">Product cost</th>
              <th className="r">Company price</th>
              <th className="r">Gross profit per unit</th>
            </tr>
          </thead>
          <tbody>
            {data.products.map((p) => (
              <PriceRow key={p.sku} p={p} editable={editable} />
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
