"use client";

import { useEffect, useState } from "react";
import { Radio } from "lucide-react";
import { adCost, canEditRules, openCycle, personOf, profitPerOrder } from "@/lib/engine";
import { L } from "@/lib/labels";
import { useData, useStore } from "@/lib/store";
import { Avatar, Card, Fig, Tile, useMoney } from "./ui";

const BUYERS = ["tobi", "zainab"];

/** Profit per order, plus each media buyer's ad cost per delivered order against the founder's cap.
 *  Ad spend comes from a simulated feed. Nothing here touches anyone's pay. */
export function AdBudget() {
  const data = useData();
  const role = useStore((s) => s.role);
  const setMax = useStore((s) => s.setMaxCostPerOrder);
  const m = useMoney();
  const open = openCycle(data);
  const editable = canEditRules(role);
  const ppo = profitPerOrder(data);

  const [draft, setDraft] = useState(String(data.maxCostPerOrder));
  useEffect(() => setDraft(String(data.maxCostPerOrder)), [data.maxCostPerOrder]);
  const commit = () => {
    const n = Number(draft);
    if (draft.trim() === "" || !Number.isFinite(n) || n < 0) setDraft(String(data.maxCostPerOrder));
    else setMax(n);
  };

  return (
    <Card
      title="Profit per order and ad cost"
      sub={`${L.simulatedFeedNote} Ad cost is flagged against your max; it never changes anyone's pay.`}
      actions={
        <span className="pill warn">
          <Radio size={12} style={{ marginRight: 5 }} />
          {L.simulatedFeed}
        </span>
      }
    >
      <dl className="tiles" style={{ marginBottom: 14 }}>
        <Tile
          label={L.profitPerOrderBeforePay}
          note={`Revenue − product cost − ads, over ${ppo.orders} delivered order${ppo.orders === 1 ? "" : "s"}`}
          tone={ppo.before < 0 ? "neg" : "pos"}
        >
          <Fig amount={ppo.before} sign drill={ppo.beforeDrill} />
        </Tile>
        <Tile label={L.profitPerOrderAfterPay} note="The same, after fixed salary and sales pay" tone={ppo.after < 0 ? "neg" : "pos"}>
          <Fig amount={ppo.after} sign drill={ppo.afterDrill} />
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

      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Media buyer</th>
              <th className="r">Ad spend ({open.id})</th>
              <th className="r">Delivered orders</th>
              <th className="r">{L.costPerOrder}</th>
              <th>Against your max</th>
            </tr>
          </thead>
          <tbody>
            {BUYERS.map((id) => {
              const c = adCost(data, id);
              const p = personOf(data, id);
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
      </div>
    </Card>
  );
}
