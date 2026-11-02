"use client";

import { AlertTriangle } from "lucide-react";
import { canSeeAllPayouts, closerStats, openLines, orderValue, payslip, personOf } from "@/lib/engine";
import { pct } from "@/lib/format";
import { PAY_LINE_TEXT } from "@/lib/labels";
import { useData, useStore } from "@/lib/store";
import { Avatar, Card, Fig } from "./ui";
import type { Drill } from "@/lib/types";

export function CloserScorecard() {
  const data = useData();
  const role = useStore((s) => s.role);
  // Other people's pay is for the founder and accountant only; a team lead sees quality, not pay.
  const showPay = canSeeAllPayouts(role);
  const closers = ["amaka", "chidi"];
  const lines = openLines(data);
  const cap = data.rules.returnCap ?? 1;
  const [worst, best] = closers
    .map((id) => ({ id, name: personOf(data, id).name.split(" ")[0], rate: closerStats(data, id).returnRate }))
    .sort((a, b) => b.rate - a.rate);

  function buildCloserDrill(id: string): Drill {
    const p = personOf(data, id);
    const ps = payslip(lines, id);
    return {
      title: `${p.name} · This Week's Payslip`,
      subtitle: `${p.title} · Reports to Ngozi Eze`,
      lines: ps.lines.map((l) => ({
        ref: l.orderId ? `#${l.orderId}` : l.kind.toUpperCase(),
        label:
          l.kind === "base"
            ? PAY_LINE_TEXT.base
            : l.kind === "commission"
              ? PAY_LINE_TEXT.commission(l.orderId)
              : PAY_LINE_TEXT.adjustment(l.kind),
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
          : "Paying on volume alone encourages over-promising on the phone. The founder can turn on a Return-rate gate in Pay rules to penalise closers whose orders keep coming back."
      }
      flush
    >
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Closer</th>
              <th className="r">Delivered sales</th>
              <th>Return rate</th>
              {showPay && <th className="r">This week's pay</th>}
              {showPay && <th className="r">Profit contributed</th>}
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
                          {st.delivered} delivered · {st.returned} returned{st.failed ? ` · ${st.failed} failed` : ""}
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
                          subtitle: "All weeks",
                          lines: data.orders
                            .filter((o) => o.closer === id && o.stage === "delivered")
                            .map((o) => ({
                              ref: `#${o.id}`,
                              label: `${o.customer} · ${o.sku} ×${o.qty}`,
                              detail: `Delivered in ${o.deliveredCycle}`,
                              amount: orderValue(o),
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

                  {showPay && <td className="r mono">
                    <b style={{ fontSize: 14 }}>
                      <Fig amount={ps.gross} drill={() => buildCloserDrill(id)} />
                    </b>
                    <span className="sub">
                      Commission: <Fig amount={st.earnedThisCycle} drill={() => buildCloserDrill(id)} />
                    </span>
                  </td>}
                  {showPay && <td className="r mono">
                    <b className={st.netContribution < 0 ? "neg" : "pos"} style={{ fontSize: 14 }}>
                      <Fig amount={st.netContribution} sign drill={st.contributionDrill} />
                    </b>
                    <span className="sub">After product cost &amp; delivery fees</span>
                  </td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showPay && <div style={{ padding: "12px 20px 18px" }}>
        <div className="insight">
          <AlertTriangle size={17} />
          <div>
            <b>Why this matters:</b> Volume alone hides quality: <b>{pct(worst.rate, 0)} of {worst.name}&apos;s resolved orders come back</b> (vs {best.name}&apos;s {pct(best.rate, 0)}). Set <b>Return-rate gate → 30% cap</b> in Pay rules to halve a closer&apos;s commission until their return rate drops.
          </div>
        </div>
      </div>}
    </Card>
  );
}
