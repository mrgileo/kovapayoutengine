"use client";

import { useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { canSeeAllPayouts, closerStats, orderValue, payslip, personOf } from "@/lib/engine";
import { linesOf } from "@/lib/derived";
import { pct } from "@/lib/format";
import { PAY_LINE_TEXT } from "@/lib/labels";
import { matchesQuery } from "@/lib/sort";
import { useData, useMe, useStore } from "@/lib/store";
import { Card, Fig } from "./ui";
import { NoMatches, ScrollTable, SearchBox, SortSelect, SortTh, useSortable, type Col } from "./table";
import type { Drill } from "@/lib/types";

export function CloserScorecard() {
  const data = useData();
  const role = useStore((s) => s.role);
  const me = useMe();
  // Other people's pay is for the founder and accountant only; a team lead sees quality, not pay.
  const showPay = canSeeAllPayouts(role);
  const cap = data.rules.returnCap ?? 1;
  const [query, setQuery] = useState("");

  // One pass per closer, not one per render: the stats and the payslip are worked out once and reused by the rows,
  // the sort and the "why this matters" note.
  const rows = useMemo(() => {
    const lines = linesOf(data);
    return data.people
      .filter((p) => p.role === "closer" && (role !== "lead" || p.reportsTo === me))
      .map((p) => ({ p, st: closerStats(data, p.id, lines), ps: payslip(lines, p.id) }));
  }, [data, role, me]);

  const shownRows = useMemo(() => rows.filter((r) => matchesQuery(query, r.p.name)), [rows, query]);
  const cols: Col<(typeof rows)[number]>[] = [
    { key: "name", label: "Closer", get: (r) => r.p.name },
    { key: "sales", label: "Delivered sales", get: (r) => r.st.deliveredValue, align: "r", first: "desc" },
    { key: "rate", label: "Return rate", get: (r) => r.st.returnRate, first: "desc" },
    ...(showPay
      ? [
          { key: "pay", label: "This week's pay", get: (r: (typeof rows)[number]) => r.ps.gross, align: "r" as const, first: "desc" as const },
          { key: "profit", label: "Profit contributed", get: (r: (typeof rows)[number]) => r.st.netContribution, align: "r" as const, first: "desc" as const },
        ]
      : []),
  ];
  const sorter = useSortable(shownRows, cols);

  // Needs two closers to compare; with one there is nothing to contrast.
  const ranked = rows.length >= 2 ? [...rows].sort((a, b) => b.st.returnRate - a.st.returnRate) : [];
  const worst = ranked[0];
  const best = ranked[ranked.length - 1];

  function buildCloserDrill(id: string): Drill {
    const p = personOf(data, id);
    const ps = payslip(linesOf(data), id);
    return {
      title: `${p.name} · This Week's Payslip`,
      subtitle: `${p.title}${p.reportsTo ? ` · Reports to ${personOf(data, p.reportsTo).name}` : ""}`,
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

  /** Built only when someone opens it: every delivered order for this closer. */
  function deliveredDrill(id: string, total: number): Drill {
    return {
      title: `${personOf(data, id).name} · Delivered Orders`,
      subtitle: "All weeks",
      lines: data.orders
        .filter((o) => o.closer === id && o.stage === "delivered")
        .map((o) => ({
          ref: `#${o.id}`,
          label: `${o.customer} · ${o.sku} ×${o.qty}`,
          detail: `Delivered in ${o.deliveredCycle}`,
          amount: orderValue(o),
        })),
      total,
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
      actions={
        rows.length > 1 ? (
          <div className="filters" style={{ alignItems: "center" }}>
            <SearchBox value={query} onChange={setQuery} label="Search closers" placeholder="Search closers…" />
            <SortSelect s={sorter} />
          </div>
        ) : undefined
      }
      flush
    >
      {shownRows.length === 0 && query.trim() ? <NoMatches query={query} /> : null}
      <ScrollTable rows={7}>
        <table className="tbl">
          <thead>
            <tr>
              <SortTh s={sorter} col="name" />
              <SortTh s={sorter} col="sales" />
              <SortTh s={sorter} col="rate" />
              {showPay && <SortTh s={sorter} col="pay" />}
              {showPay && <SortTh s={sorter} col="profit" />}
            </tr>
          </thead>
          <tbody>
            {sorter.sorted.map(({ p, st, ps }) => {
              const id = p.id;
              const highReturn = st.returnRate > 0.25;
              return (
                <tr key={id}>
                  <td>
                    <b>{p.name}</b>
                    <span className="sub">
                      {st.delivered} delivered · {st.returned} returned{st.failed ? ` · ${st.failed} failed` : ""}
                    </span>
                  </td>

                  <td className="r mono">
                    <b>
                      <Fig amount={st.deliveredValue} drill={() => deliveredDrill(id, st.deliveredValue)} />
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

                  {showPay && (
                    <td className="r mono">
                      <b style={{ fontSize: 14 }}>
                        <Fig amount={ps.gross} drill={() => buildCloserDrill(id)} />
                      </b>
                      <span className="sub">
                        Commission: <Fig amount={st.earnedThisCycle} drill={() => buildCloserDrill(id)} />
                      </span>
                    </td>
                  )}
                  {showPay && (
                    <td className="r mono">
                      <b className={st.netContribution < 0 ? "neg" : "pos"} style={{ fontSize: 14 }}>
                        <Fig amount={st.netContribution} sign drill={st.contributionDrill} />
                      </b>
                      <span className="sub">After product cost &amp; delivery fees</span>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </ScrollTable>

      {showPay && worst && best && (
        <div style={{ padding: "12px 20px 18px" }}>
          <div className="insight">
            <AlertTriangle size={17} />
            <div>
              <b>Why this matters:</b> Volume alone hides quality: <b>{pct(worst.st.returnRate, 0)} of {worst.p.name.split(" ")[0]}&apos;s resolved orders come back</b> (vs {best.p.name.split(" ")[0]}&apos;s {pct(best.st.returnRate, 0)}). Set <b>Return-rate gate → 30% cap</b> in Pay rules to halve a closer&apos;s commission until their return rate drops.
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
