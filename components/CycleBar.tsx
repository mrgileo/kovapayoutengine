"use client";

import { Download, Lock, CheckCircle2, ArrowRight } from "lucide-react";
import { canEditRules, cycleLines, openCycle, payoutCsv, payslip, personOf, pnlFor, salesPeople, sum } from "@/lib/engine";
import { dateTime, shortDate, shortName } from "@/lib/format";
import { useData, useStore } from "@/lib/store";
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
  const closeCycle = useStore((s) => s.closeCycle);
  const markPaid = useStore((s) => s.markPaid);
  const lockCycle = useStore((s) => s.lockCycle);
  const toast = useStore((s) => s.toast);
  const editable = canEditRules(role);
  const open = openCycle(data);

  function downloadCsv(cycleId: string) {
    const csv = payoutCsv(data, cycleId);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kova-payouts-${cycleId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast("ok", `Exported bank payout CSV for ${cycleId}.`);
  }

  function buildCycleDrill(c: Cycle): Drill {
    const lines = cycleLines(data, c.id);
    const people = salesPeople(data);
    return {
      title: `${c.id} Payout Breakdown (${STATUS_LABEL[c.status]})`,
      subtitle: `${shortDate(c.start)} – ${shortDate(c.end)} · Fixed salary + sales pay, less any pay taken back`,
      lines: people.map((p) => {
        const ps = payslip(lines, p.id);
        const parts: string[] = [];
        if (ps.base) parts.push(`Salary: ₦${ps.base.toLocaleString()}`);
        if (ps.commission) parts.push(`Sales pay: ₦${Math.round(ps.commission).toLocaleString()}`);
        if (ps.adjustments) parts.push(`Pay taken back: ₦${Math.round(ps.adjustments).toLocaleString()}`);
        if (ps.carry) parts.push(`Carry: ₦${Math.round(ps.carry).toLocaleString()}`);
        return {
          ref: p.role.toUpperCase(),
          label: p.name,
          detail: parts.join(" · ") || "No activity",
          amount: ps.payable,
        };
      }),
      total: sum(people.map((p) => payslip(lines, p.id).payable)),
    };
  }

  return (
    <Card
      title="Payout Cycles & Settlement"
      sub="Accrued → Approved → Paid → Locked. Try returning an order from W43 (paid) vs W42 (locked) in the ledger below to see pay taken back after a week closes."
      actions={
        editable && (
          <button type="button" className="btn primary sm" onClick={closeCycle}>
            Close &amp; approve {open.id} <ArrowRight size={14} />
          </button>
        )
      }
      flush
    >
      <div className="cycles">
        {data.cycles.map((c) => {
          const pnl = pnlFor(data, c.id);
          const lines = cycleLines(data, c.id);
          const totalPayable = sum(salesPeople(data).map((p) => payslip(lines, p.id).payable));
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
                <button type="button" className="btn xs" onClick={() => downloadCsv(c.id)}>
                  <Download size={12} /> Bank CSV
                </button>
                {editable && c.status === "approved" && (
                  <button type="button" className="btn xs primary" onClick={() => markPaid(c.id)}>
                    <CheckCircle2 size={12} /> Mark paid
                  </button>
                )}
                {editable && c.status === "paid" && (
                  <button type="button" className="btn xs" onClick={() => lockCycle(c.id)}>
                    <Lock size={12} /> Lock cycle
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

