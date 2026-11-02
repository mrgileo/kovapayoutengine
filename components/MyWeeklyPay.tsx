"use client";

import { PERSONA, cycleLines, payslip } from "@/lib/engine";
import { PAY_LINE_TEXT } from "@/lib/labels";
import { shortDate } from "@/lib/format";
import { useData, useStore } from "@/lib/store";
import { Card, Fig } from "./ui";
import type { Cycle, Drill } from "@/lib/types";

const STATUS: Record<Cycle["status"], string> = { open: "This week", approved: "Approved", paid: "Paid", locked: "Paid" };

/** What the viewer earned each week. Everyone else's pay is not shown: only the founder and accountant see all payouts. */
export function MyWeeklyPay() {
  const data = useData();
  const role = useStore((s) => s.role);
  const me = PERSONA[role];

  const rows = [...data.cycles].reverse().map((c) => {
    const slip = payslip(cycleLines(data, c.id), me);
    const drill: Drill = {
      title: `${c.id} · Your pay`,
      subtitle: `${shortDate(c.start)} – ${shortDate(c.end)}`,
      lines: slip.lines.map((l) => ({
        ref: l.orderId ? `#${l.orderId}` : l.kind.toUpperCase(),
        label: l.kind === "base" ? PAY_LINE_TEXT.base : l.kind === "commission" ? PAY_LINE_TEXT.commission(l.orderId) : PAY_LINE_TEXT.adjustment(l.kind),
        detail: l.note,
        amount: l.amount,
      })),
      total: slip.gross,
    };
    return { c, slip, drill };
  });

  return (
    <Card title="What you earned each week" sub="Your own pay for every week. Nobody else's is shown here." flush>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Week</th>
              <th>Status</th>
              <th className="r">Pay</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ c, slip, drill }) => (
              <tr key={c.id}>
                <td>
                  <b>{c.id}</b>
                  <span className="sub">
                    {shortDate(c.start)} – {shortDate(c.end)}
                  </span>
                </td>
                <td>
                  <span className={"pill " + (c.status === "open" ? "info" : c.status === "approved" ? "warn" : "pos")}>{STATUS[c.status]}</span>
                </td>
                <td className="r mono">
                  <b>
                    <Fig amount={slip.payable} drill={drill} />
                  </b>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
