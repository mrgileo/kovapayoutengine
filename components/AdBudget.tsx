"use client";

import { useEffect, useMemo, useState } from "react";
import { Radio } from "lucide-react";
import { adCost, campaignStats, canEditRules, openCycle, openLines, personOf } from "@/lib/engine";
import { linesOf } from "@/lib/derived";
import { L } from "@/lib/labels";
import { useData, useStore } from "@/lib/store";
import { askSetMaxCost } from "@/lib/askActions";
import { Avatar, Card, Fig, Tile, useMoney } from "./ui";
import { ScrollTable, SortSelect, SortTh, useSortable, type Col } from "./table";

/** Profit per order, plus each media buyer's ad cost per delivered order against the founder's cap.
 *  Ad spend comes from a simulated feed. Nothing here touches anyone's pay. */
export function AdBudget() {
  const data = useData();
  const role = useStore((s) => s.role);
  const setMax = askSetMaxCost;
  const m = useMoney();
  const open = openCycle(data);
  const buyers = data.people.filter((p) => p.role === "buyer").map((p) => p.id);
  const editable = canEditRules(role);
  const buyerRows = useMemo(() => buyers.map((id) => ({ id, p: personOf(data, id), c: adCost(data, id) })), [data]); // eslint-disable-line react-hooks/exhaustive-deps
  const buyerCols: Col<(typeof buyerRows)[number]>[] = [
    { key: "name", label: "Media buyer", get: (r) => r.p.name },
    { key: "spend", label: `Ad spend (${open.id})`, get: (r) => r.c.spend, align: "r", first: "desc" },
    { key: "delivered", label: "Delivered orders", get: (r) => r.c.delivered, align: "r", first: "desc" },
    { key: "cost", label: L.costPerOrder, get: (r) => r.c.costPerOrder, align: "r", first: "desc" },
    { key: "max", label: "Against your max", get: (r) => (r.c.spend === 0 ? 0 : r.c.overMax ? 2 : 1) },
  ];
  const buyerSort = useSortable(buyerRows, buyerCols);
  // Two totals for the week: what was spent on ads, and the delivered sales those ads produced.
  const lines = linesOf(data);
  const stats = buyers.map((id) => ({ id, name: personOf(data, id).name, c: campaignStats(data, id, lines) }));
  const totalSpend = stats.reduce((a, x) => a + x.c.spend, 0);
  const totalRevenue = stats.reduce((a, x) => a + x.c.deliveredRev, 0);

  const [draft, setDraft] = useState(String(data.maxCostPerOrder));
  useEffect(() => setDraft(String(data.maxCostPerOrder)), [data.maxCostPerOrder]);
  const commit = () => {
    const n = Number(draft);
    if (draft.trim() === "" || !Number.isFinite(n) || n < 0) setDraft(String(data.maxCostPerOrder));
    else {
      setMax(n);
      setDraft(String(data.maxCostPerOrder)); // the limit only changes once confirmed
    }
  };

  return (
    <Card
      title="Advertising Costs"
      tone="yellow"
      flush
      sub={`${L.simulatedFeedNote}`}
      actions={
        <span className="pill warn">
          <Radio size={12} style={{ marginRight: 5 }} />
          {L.simulatedFeed}
        </span>
      }
    >
      <div style={{ padding: "16px 20px 6px" }}>
      <dl className="tiles" style={{ marginBottom: 14 }}>
        <Tile label="Total ad spend" note={`All media buyers · ${open.id}`}>
          <Fig
            amount={totalSpend}
            drill={{
              title: `${open.id} · Total ad spend`,
              lines: stats.map((x) => ({ ref: "Sim. feed", label: x.name, amount: x.c.spend })),
              total: totalSpend,
            }}
          />
        </Tile>
        <Tile label="Revenue from those ads" note="Delivered sales from orders the buyers' ads brought in" tone="pos">
          <Fig
            amount={totalRevenue}
            drill={{
              title: `${open.id} · Revenue from ads`,
              lines: stats.map((x) => ({ ref: "Delivered", label: x.name, amount: x.c.deliveredRev })),
              total: totalRevenue,
            }}
          />
        </Tile>
      </dl>

      <label style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 12.5, fontWeight: 600, marginBottom: 12 }}>
        <span>{L.maxCostPerOrder}</span>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          step={100}
          value={draft}
          disabled={!editable}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          aria-label={L.maxCostPerOrder}
          style={{ width: 110, padding: "6px 9px", borderRadius: 8, border: "1px solid var(--line-strong)", font: "inherit" }}
        />
        <span className="muted" style={{ fontWeight: 400 }}>
          {editable ? "Set by you." : "Set by the founder."} Now {m(data.maxCostPerOrder)} per delivered order.
        </span>
      </label>

      </div>

      {buyerRows.length > 4 && (
        <div className="filters" style={{ padding: "0 20px 10px" }}>
          <SortSelect s={buyerSort} />
        </div>
      )}
      <ScrollTable rows={7}>
        <table className="tbl">
          <thead>
            <tr>
              {buyerCols.map((c) => (
                <SortTh key={c.key} s={buyerSort} col={c.key} />
              ))}
            </tr>
          </thead>
          <tbody>
            {buyerSort.sorted.map(({ id, p, c }) => {
              return (
                <tr key={id}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                      <Avatar id={p.id} name={p.name} size="sm" />
                      <b>{p.name}</b>
                    </div>
                  </td>
                  <td className="r mono">{m(c.spend)}</td>
                  <td className="r mono">{c.delivered}</td>
                  <td className={"r mono " + (c.overMax ? "neg" : "pos")} style={{ fontWeight: 600 }}>
                    {c.costPerOrder === null ? "—" : m(c.costPerOrder)}
                  </td>
                  <td>
                    <span className={"pill " + (c.spend === 0 ? "plain" : c.overMax ? "neg" : "pos")}>
                      {c.spend === 0 ? "No ad spend" : c.overMax ? (c.costPerOrder === null ? "Spend, nothing delivered" : "Over max") : "Within max"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </ScrollTable>
    </Card>
  );
}
