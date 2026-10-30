"use client";

import { AlertTriangle } from "lucide-react";
import { closerStats, openLines, payslip, personOf } from "@/lib/engine";
import { pct } from "@/lib/format";
import { useData } from "@/lib/store";
import { Avatar, Card, Fig } from "./ui";
import type { Drill } from "@/lib/types";

export function CloserScorecard() {
  const data = useData();
  const closers = ["amaka", "chidi"];
  const lines = openLines(data);
  const cap = data.rules.returnCap ?? 1;

  function buildCloserDrill(id: string): Drill {
    const p = personOf(data, id);
    const ps = payslip(lines, id);
    return {
      title: `${p.name} · Current Cycle Payslip`,
      subtitle: `${p.title} · Reports to Ngozi Eze`,
      lines: ps.lines.map((l) => ({
        ref: l.orderId ? `#${l.orderId}` : l.kind.toUpperCase(),
        label:
          l.kind === "base"
            ? "Weekly pro-rated base"
            : l.kind === "commission"
              ? `Order #${l.orderId}`
              : `Adjustment (${l.kind})`,
        detail: l.note,
        amount: l.amount,
      })),
      total: ps.gross,
    };
  }

  return (
    <Card
      title="Closer Quality, Return Rate & Net Contribution"
      sub={
        cap < 1
          ? `Quality gate active (${Math.round(cap * 100)}% return cap): closers above the cap have their commission halved automatically.`
          : "Paying pure volume incentivizes over-promising on the phone. Toggle the Return-rate quality gate above to penalize high-return closers."
      }
      flush
    >
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Closer</th>
              <th className="r">Delivered vol.</th>
              <th>Return rate</th>
              <th className="r">Avg discount</th>
              <th className="r">Cycle pay</th>
              <th className="r">Net margin contrib.</th>
            </tr>
          </thead>
          <tbody>
            {closers.map((id) => {
              const p = personOf(data, id);
              const st = closerStats(data, id);
              const ps = payslip(lines, id);
              const highReturn = st.returnRate > 0.25;
              return (
                <tr key={id}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <Avatar id={p.id} name={p.name} />
                      <div>
                        <b>{p.name}</b>
                        <span className="sub">
                          {st.delivered} landed · {st.returned} returned{st.failed ? ` · ${st.failed} failed` : ""}
                        </span>
                      </div>
                    </div>
                  </td>

                  <td className="r mono">
                    <b>
                      <Fig
                        amount={st.deliveredValue}
                        drill={{
                          title: `${p.name} · Delivered Orders`,
                          subtitle: "Across all cycles",
                          lines: data.orders
                            .filter((o) => o.closer === id && o.stage === "delivered")
                            .map((o) => ({
                              ref: `#${o.id}`,
                              label: `${o.customer} · ${o.sku} ×${o.qty}`,
                              detail: `Delivered in ${o.deliveredCycle}${o.discount ? ` (${Math.round(o.discount * 100)}% off)` : ""}`,
                              amount: Math.round(o.list * (1 - o.discount)),
                            })),
                          total: st.deliveredValue,
                        }}
                      />
                    </b>
                    <span className="sub">{st.orders} total assigned</span>
                  </td>

                  <td style={{ minWidth: 150 }}>
                    <div className="rate">
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "nowrap" }}>
                        <b className={"mono " + (highReturn ? "neg" : "pos")}>{pct(st.returnRate, 0)}</b>
                        <span className={`pill ${st.capBreached ? "neg" : highReturn ? "warn" : "pos"}`}>
                          {st.capBreached ? "½ rate gate" : highReturn ? "High risk" : "Healthy"}
                        </span>
                      </div>
                      <div className="rate-bar">
                        <i
                          style={{
                            width: `${Math.min(100, st.returnRate * 100)}%`,
                            background: highReturn ? "var(--neg)" : "var(--pos)",
                          }}
                        />
                      </div>
                    </div>
                  </td>

                  <td className="r mono">
                    <b>{st.discounted ? pct(st.avgDiscount, 0) : "0%"}</b>
                    <span className="sub">
                      {st.discounted ? `${st.discounted} order${st.discounted === 1 ? "" : "s"} discounted` : "List price held"}
                    </span>
                  </td>

                  <td className="r mono">
                    <b style={{ fontSize: 14 }}>
                      <Fig amount={ps.gross} drill={() => buildCloserDrill(id)} />
                    </b>
                    <span className="sub">
                      Comm: <Fig amount={st.earnedThisCycle} drill={() => buildCloserDrill(id)} />
                    </span>
                  </td>

                  <td className="r mono">
                    <b className={st.netContribution < 0 ? "neg" : "pos"} style={{ fontSize: 14 }}>
                      <Fig amount={st.netContribution} sign drill={st.contributionDrill} />
                    </b>
                    <span className="sub">After COGS &amp; courier</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ padding: "12px 20px 18px" }}>
        <div className="insight">
          <AlertTriangle size={17} />
          <div>
            <b>Why this matters:</b> Amaka books higher volume, but <b>37.5% of her resolved orders come back</b> (vs Chidi&apos;s 14.3%) and she discounted Order #1049 by 15% (past the 10% guardrail). Set <b>Return-rate quality gate → 30% cap</b> in the rules strip above to automatically halve her commission rate until her return rate drops.
          </div>
        </div>
      </div>
    </Card>
  );
}
