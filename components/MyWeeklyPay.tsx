"use client";

import { useMemo } from "react";
import { cycleLines, payslip } from "@/lib/engine";
import { PAY_LINE_TEXT } from "@/lib/labels";
import { shortDate } from "@/lib/format";
import { useData, useMe } from "@/lib/store";
import { Card, Fig } from "./ui";
import { ScrollTable, SortSelect, SortTh, useSortable, type Col } from "./table";
import type { Cycle, Drill } from "@/lib/types";

const STATUS: Record<Cycle["status"], string> = { open: "This week", approved: "Approved", paid: "Paid", locked: "Paid" };

/** What the viewer earned each week. Everyone else's pay is not shown: only the founder and accountant see all payouts. */
export function MyWeeklyPay() {
  const data = useData();
  const me = useMe();

  const rows = useMemo(() => [...data.cycles].reverse().map((c) => {
    const slip = payslip(cycleLines(data, c.id), me);
    const drill = (): Drill => ({
      title: `${c.id} · Your pay`,
      subtitle: `${shortDate(c.start)} – ${shortDate(c.end)}`,
      lines: slip.lines.map((l) => ({
        ref: l.orderId ? `#${l.orderId}` : l.kind.toUpperCase(),
        label: l.kind === "base" ? PAY_LINE_TEXT.base : l.kind === "commission" ? PAY_LINE_TEXT.commission(l.orderId) : PAY_LINE_TEXT.adjustment(l.kind),
        detail: l.note,
        amount: l.amount,
      })),
      total: slip.gross,
    });
    return { c, slip, drill };
  }), [data, me]);
  const cols: Col<(typeof rows)[number]>[] = [
    { key: "week", label: "Week", get: (r) => r.c.id, first: "desc" },
    { key: "status", label: "Status", get: (r) => STATUS[r.c.status] },
    { key: "pay", label: "Pay", get: (r) => r.slip.payable, align: "r", first: "desc" },
  ];
  const sorter = useSortable(rows, cols);

  return (
    <Card
      title="What you earned each week"
      sub="Your own pay for every week. Nobody else's is shown here."
      actions={rows.length > 4 ? <SortSelect s={sorter} /> : undefined}
      flush
    >
      <ScrollTable rows={8}>
        <table className="tbl">
          <thead>
            <tr>
              {cols.map((c) => (
                <SortTh key={c.key} s={sorter} col={c.key} />
              ))}
            </tr>
          </thead>
          <tbody>
            {sorter.sorted.map(({ c, slip, drill }) => (
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
      </ScrollTable>
    </Card>
  );
}
