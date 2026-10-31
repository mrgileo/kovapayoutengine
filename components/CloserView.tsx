"use client";

import { Smartphone, Lock, AlertTriangle } from "lucide-react";
import {
  closerStats,
  commissionLines,
  openCycle,
  openLines,
  orderValue,
  payslip,
  productOf,
  stockRow,
  sum,
} from "@/lib/engine";
import { pct } from "@/lib/format";
import { L, PAY_LINE_TEXT } from "@/lib/labels";
import { useData } from "@/lib/store";
import { Fig, Tile } from "./ui";
import type { Drill } from "@/lib/types";

export function CloserView() {
  const data = useData();
  const open = openCycle(data);
  const lines = openLines(data);
  const ps = payslip(lines, "amaka");
  const st = closerStats(data, "amaka");

  const mine = data.orders.filter(
    (o) => (o.closer === "amaka" || o.openedBy === "amaka") && o.createdCycle === open.id,
  );
  const openOrders = mine.filter((o) => o.stage !== "delivered" && o.stage !== "returned" && o.stage !== "cancelled");
  const blocked = openOrders.filter((o) => stockRow(data, productOf(data, o.sku)).available <= 0);

  // Potential commission if all open pipeline lands
  const potentialLines = openOrders.flatMap((o) =>
    commissionLines(data, { ...o, stage: "delivered", cashIn: true }, data.rules, open.id).filter(
      (l) => l.personId === "amaka",
    ),
  );
  const potentialTotal = sum(potentialLines.map((l) => l.amount));

  const payslipDrill: Drill = {
    title: `Amaka Obi · ${open.id} Payslip Breakdown`,
    subtitle: "Closer · Reports to Ngozi Eze",
    lines: ps.lines.map((l) => ({
      ref: l.orderId ? `#${l.orderId}` : l.kind.toUpperCase(),
      label: l.kind === "base" ? PAY_LINE_TEXT.base : l.kind === "commission" ? PAY_LINE_TEXT.commission(l.orderId) : PAY_LINE_TEXT.adjustment(l.kind),
      detail: l.note,
      amount: l.amount,
    })),
    total: ps.gross,
  };

  const potentialDrill: Drill = {
    title: "Commission on your open orders",
    subtitle: "If every open order is delivered and not returned",
    lines: openOrders.map((o) => {
      const ls = commissionLines(data, { ...o, stage: "delivered", cashIn: true }, data.rules, open.id).filter(
        (l) => l.personId === "amaka",
      );
      const amt = sum(ls.map((l) => l.amount));
      return {
        ref: `#${o.id}`,
        label: `${o.customer} · ${o.sku} ×${o.qty} (${o.stage})`,
        detail: ls[0]?.note ?? "You do not earn on this order under the current split rule",
        amount: amt,
      };
    }),
    total: potentialTotal,
  };

  return (
    <div className="stack">
      <div className="phone-hero">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span className="eyebrow">
            <Smartphone size={12} style={{ verticalAlign: -2, marginRight: 5 }} />
            Phone-First Closer Console · {open.id}
          </span>
          <span className="pill brand">
            <Lock size={11} /> Delivery certified by Warehouse
          </span>
        </div>

        <div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>Net take-home accruing this week</div>
          <div className="big">
            <Fig amount={ps.payable} drill={payslipDrill} />
          </div>
        </div>

        <div className="split">
          <div>
            <span>{L.fixedSalary}</span>
            <b>
              <Fig amount={ps.base} drill={payslipDrill} />
            </b>
          </div>
          <div>
            <span>{L.salesPay}</span>
            <b>
              <Fig amount={ps.commission} drill={payslipDrill} />
            </b>
          </div>
          <div>
            <span>{PAY_LINE_TEXT.takenBackCarry}</span>
            <b className={ps.adjustments + ps.carry < 0 ? "neg-t" : ""}>
              <Fig amount={ps.adjustments + ps.carry} sign drill={payslipDrill} />
            </b>
          </div>
        </div>
      </div>

      <dl className="tiles">
        <Tile
          label="In your open pipeline"
          note={`${openOrders.length} open orders. You earn once the warehouse marks them delivered`}
          tone="pos"
        >
          <Fig amount={potentialTotal} sign drill={potentialDrill} />
        </Tile>
        <Tile
          label="Your return rate"
          note={`${st.returned} came back out of ${st.delivered + st.returned} finished orders (delivered or returned)`}
          tone={st.returnRate > 0.25 ? "neg" : "pos"}
        >
          <span className="num">{pct(st.returnRate, 0)}</span>
        </Tile>
        <Tile
          label="Stock-blocked orders"
          note={
            blocked.length
              ? `${blocked.length} order${blocked.length === 1 ? "" : "s"} waiting for stock to arrive`
              : "All open orders have stock"
          }
          tone={blocked.length ? "warn" : "pos"}
        >
          <span className="num">{blocked.length}</span>
        </Tile>
      </dl>

      {blocked.length > 0 && (
        <div className="alert warn">
          <AlertTriangle size={16} />
          <span>
            <b>Stock block:</b> Order #{blocked.map((o) => o.id).join(", #")} cannot be confirmed until Dayo (Inventory) raises a PO for{" "}
            {Array.from(new Set(blocked.map((o) => o.sku))).join(", ")}.
          </span>
        </div>
      )}
    </div>
  );
}

