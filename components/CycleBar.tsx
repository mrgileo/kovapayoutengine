"use client";

import { useMemo } from "react";
import { Download, Lock, CheckCircle2, ArrowRight } from "lucide-react";
import { canApprove, canSettle, cycleLines, openCycle, payoutCsv, payslipsFor, personOf, salesPeople, sum } from "@/lib/engine";
import { linesOf, pnlOf } from "@/lib/derived";
import { dateTime, shortDate, shortName } from "@/lib/format";
import { downloadText } from "@/lib/download";
import { useData, useStore } from "@/lib/store";
import { askCloseCycle, askLockCycle, askMarkPaid } from "@/lib/askActions";
import { Card, Fig } from "./ui";
import type { Cycle, Drill } from "@/lib/types";

const STEP_INDEX = { open: 1, approved: 2, paid: 3, locked: 4 };
const STATUS_LABEL = {
  open: "Accruing",
  approved: "Approved",
  paid: "Paid",
  locked: "Locked",
};
const STATUS_TONE = {
  open: "info",
  approved: "warn",
  paid: "pos",
  locked: "plain",
};

export function CycleBar() {
  const data = useData();
  const role = useStore((s) => s.role);
  const imported = useStore((s) => s.dataSource) === "imported";
  const closeCycle = askCloseCycle;
  const markPaid = askMarkPaid;
  const lockCycle = askLockCycle;
  const toast = useStore((s) => s.toast);
  const canClose = canApprove(role);
  const settle = canSettle(role);
  const open = openCycle(data);

  // Each week's total and P&L, worked out once per change instead of on every render (this card is on two pages).
  const infos = useMemo(() => {
    const ids = salesPeople(data).map((p) => p.id);
    return new Map(
      data.cycles.map((c) => {
        const slips = payslipsFor(c.status === "open" ? linesOf(data) : (c.lines ?? []), ids);
        let total = 0;
        for (const v of slips.values()) total += v.payable;
        return [c.id, { pnl: c.status === "open" ? pnlOf(data) : c.pnl, total }] as const;
      }),
    );
  }, [data]);

  function downloadCsv(cycleId: string) {
    downloadText(`kova-payouts-${cycleId}.csv`, payoutCsv(data, cycleId));
    toast("ok", `Exported bank payout CSV for ${cycleId}.`);
  }

  function buildCycleDrill(c: Cycle): Drill {
    const people = salesPeople(data);
    const slips = payslipsFor(cycleLines(data, c.id), people.map((p) => p.id));
    return {
      title: `${c.id} Payout Breakdown (${STATUS_LABEL[c.status]})`,
      subtitle: `${shortDate(c.start)} – ${shortDate(c.end)} · Fixed salary + commission, less any customer refunds`,
      lines: people.map((p) => {
        const ps = slips.get(p.id)!;
        const parts: string[] = [];
        if (ps.base) parts.push(`Salary: ₦${ps.base.toLocaleString()}`);
        if (ps.commission) parts.push(`Commission: ₦${Math.round(ps.commission).toLocaleString()}`);
        if (ps.adjustments) parts.push(`Customer refunded: ₦${Math.round(ps.adjustments).toLocaleString()}`);
        if (ps.carry) parts.push(`Carry: ₦${Math.round(ps.carry).toLocaleString()}`);
        return {
          ref: p.role.toUpperCase(),
          label: p.name,
          detail: parts.join(" · ") || "No activity",
          amount: ps.payable,
        };
      }),
      total: sum(people.map((p) => slips.get(p.id)!.payable)),
    };
  }

  return (
    <Card
      title="Weekly payouts"
      sub={
        imported
          ? "Each week goes Accruing → Approved → Paid → Locked. Return an order from a paid week in the list below to see customer refunds after the week has closed."
          : "Each week goes Accruing → Approved → Paid → Locked. Return an order from W43 (paid) to see customer refunds, or from W42 (locked) to see that a locked week is never touched."
      }
      actions={
        canClose && (
          <button type="button" className="btn primary sm" onClick={closeCycle}>
            Close &amp; approve {open.id} <ArrowRight size={14} />
          </button>
        )
      }
      flush
    >
      <div className="cycles">
        {data.cycles.map((c) => {
          const { pnl, total: totalPayable } = infos.get(c.id)!;
          const steps = STEP_INDEX[c.status];

          return (
            <div className={"cyc" + (c.status === "open" ? " open" : "")} key={c.id}>
              <div className="cyc-top">
                <b>
                  {c.id} <span className="dates">· {shortDate(c.start)} – {shortDate(c.end)}</span>
                </b>
                <span className={`pill ${STATUS_TONE[c.status]}`}>{STATUS_LABEL[c.status]}</span>
              </div>

              <div className="steps" aria-label={`Lifecycle progress: ${STATUS_LABEL[c.status]}`}>
                {[1, 2, 3, 4].map((idx) => (
                  <span key={idx} className={idx <= steps ? "on" : ""} />
                ))}
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 4 }}>
                <div>
                  <div style={{ fontSize: 11, color: "var(--muted)" }}>Total payable</div>
                  <div className="amt">
                    <Fig amount={totalPayable} drill={() => buildCycleDrill(c)} />
                  </div>
                </div>
                {pnl && (
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 11, color: "var(--muted)" }}>Actual net</div>
                    <div className={"mono " + (pnl.actual < 0 ? "neg" : "pos")} style={{ fontWeight: 600, fontSize: 14 }}>
                      <Fig amount={pnl.actual} sign drill={pnl.drills.actual} />
                    </div>
                  </div>
                )}
              </div>

              <div className="meta">
                {c.status === "open" && "Live accrual · closes at week end"}
                {c.status === "approved" && c.closedAt && `Approved ${dateTime(c.closedAt)} by ${shortName(personOf(data, c.closedBy!).name)}`}
                {c.status === "paid" && c.paidAt && `Paid ${dateTime(c.paidAt)} · return window open`}
                {c.status === "locked" && c.lockedAt && `Locked ${dateTime(c.lockedAt)} · final`}
              </div>

              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: "auto", paddingTop: 4 }}>
                {settle && (
                  <button type="button" className="btn xs" onClick={() => downloadCsv(c.id)}>
                    <Download size={12} /> Bank file (CSV)
                  </button>
                )}
                {settle && c.status === "approved" && (
                  <button type="button" className="btn xs primary" onClick={() => markPaid(c.id)}>
                    <CheckCircle2 size={12} /> Mark paid
                  </button>
                )}
                {settle && c.status === "paid" && (
                  <button type="button" className="btn xs" onClick={() => lockCycle(c.id)}>
                    <Lock size={12} /> Lock week
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

