"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, Download, Lock, Wallet } from "lucide-react";
import { canSettle, cashDesk, computePnl, cycleLines, orderValue, payoutCsv, payoutQueue, payslip, salesPeople, sum } from "@/lib/engine";
import { downloadText } from "@/lib/download";
import { L } from "@/lib/labels";
import { shortDate } from "@/lib/format";
import { useData, useStore } from "@/lib/store";
import { LeaksPanel } from "./RevenueFlow";
import { Card, Fig, Tile, useMoney } from "./ui";

const STATUS_LABEL = { open: "Accruing", approved: "Approved, awaiting payment", paid: "Paid", locked: "Locked" } as const;
const weeks = (n: number) => (n === 0 ? "This week" : `${n} week${n === 1 ? "" : "s"}`);

/** The accountant's desk: courier cash to chase, and approved pay to execute. They cannot change orders, prices or rules. */
export function AccountantView() {
  const data = useData();
  const role = useStore((s) => s.role);
  const settleCash = useStore((s) => s.settleCash);
  const markPaid = useStore((s) => s.markPaid);
  const lockCycle = useStore((s) => s.lockCycle);
  const toast = useStore((s) => s.toast);
  const m = useMoney();

  const desk = cashDesk(data);
  const queue = payoutQueue(data);
  const pnl = computePnl(data);
  const settle = canSettle(role);

  const defaultCycle = queue.next.kind === "wait" ? (data.cycles.filter((c) => c.status !== "open").at(-1)?.id ?? queue.next.cycleId) : queue.next.cycleId;
  const [picked, setPicked] = useState<string | null>(null);
  const cycleId = picked && data.cycles.some((c) => c.id === picked) ? picked : defaultCycle;
  const cycle = data.cycles.find((c) => c.id === cycleId)!;
  const lines = cycleLines(data, cycleId);
  const slips = salesPeople(data).map((p) => ({ p, ps: payslip(lines, p.id) }));
  const payable = sum(slips.map((x) => x.ps.payable));

  const awaiting = sum(queue.awaitingPayment.map((x) => x.payable));
  const nextText =
    queue.next.kind === "pay"
      ? `${queue.next.cycleId} is approved. Export the bank file, pay it, then mark it paid.`
      : queue.next.kind === "lock"
        ? `${queue.next.cycleId} is paid. Lock it once its return window has closed.`
        : `Nothing to pay yet. ${queue.next.cycleId} is still accruing; the founder closes and approves it at week end.`;

  function exportFile() {
    downloadText(`kova-payouts-${cycleId}.csv`, payoutCsv(data, cycleId));
    toast("ok", `Exported the bank payout file for ${cycleId}.`);
  }

  return (
    <div className="stack">
      <dl className="tiles">
        <Tile
          label="Cash still with couriers"
          note={desk.outstanding.length ? `${desk.outstanding.length} order${desk.outstanding.length === 1 ? "" : "s"} · oldest ${weeks(desk.oldestWeeks).toLowerCase()}` : "Every delivered order is settled"}
          tone={desk.total > 0 ? "warn" : "pos"}
        >
          <Fig amount={desk.total} drill={desk.drill} />
        </Tile>
        <Tile
          label="Approved, awaiting payment"
          note={queue.awaitingPayment.length ? queue.awaitingPayment.map((x) => x.cycleId).join(", ") : "Nothing approved yet"}
          tone={awaiting > 0 ? "warn" : "pos"}
        >
          <span className="num">{m(awaiting)}</span>
        </Tile>
        <Tile
          label="Paid, ready to lock"
          note={queue.readyToLock.length ? queue.readyToLock.map((x) => x.cycleId).join(", ") : "None"}
        >
          <span className="num">{queue.readyToLock.length}</span>
        </Tile>
        <Tile label={L.revenue} note={`Landed in ${pnl.cycleId}`}>
          <Fig amount={pnl.revenue} drill={pnl.drills.revenue} />
        </Tile>
      </dl>

      <Card
        title="Cash reconciliation"
        sub="What the couriers owe you, by week and by city, and how long it has been owed."
        actions={
          settle &&
          desk.outstanding.length > 0 && (
            <button type="button" className="btn primary sm" onClick={() => settleCash(desk.outstanding.map((o) => o.id))}>
              <Wallet size={13} /> Record all as received ({desk.outstanding.length} · {m(desk.total)})
            </button>
          )
        }
        flush
      >
        <div className="tbl-wrap">
          <table className="tbl" aria-label="Cash by week">
            <thead>
              <tr>
                <th>Week</th>
                <th className="r hide-sm">Orders</th>
                <th className="r hide-sm">Delivered</th>
                <th className="r hide-sm">Cash received</th>
                <th className="r">Still owed</th>
                <th>Age</th>
              </tr>
            </thead>
            <tbody>
              {desk.rows.map((r) => (
                <tr key={r.cycleId}>
                  <td className="mono">
                    <b>{r.cycleId}</b>
                  </td>
                  <td className="r mono hide-sm">{r.orders}</td>
                  <td className="r mono hide-sm">{m(r.delivered)}</td>
                  <td className="r mono pos hide-sm">{m(r.received)}</td>
                  <td className={"r mono " + (r.outstanding > 0 ? "neg" : "muted")}>{m(r.outstanding)}</td>
                  <td>
                    {r.outstanding > 0 ? (
                      <span className={"pill " + (r.ageWeeks >= 1 ? "neg" : "warn")}>
                        <AlertTriangle size={11} style={{ marginRight: 4 }} aria-hidden="true" />
                        {r.ageWeeks >= 1 ? `Overdue · ${weeks(r.ageWeeks)}` : "This week"}
                      </span>
                    ) : (
                      <span className="pill pos">
                        <CheckCircle2 size={11} style={{ marginRight: 4 }} aria-hidden="true" />
                        Settled
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {desk.outstanding.length > 0 && (
          <ul className="owed" aria-label="Orders still owed">
            {desk.outstanding.map((o) => (
              <li key={o.id} className="owed-row">
                <div className="owed-main">
                  <b className="mono">#{o.id}</b> {o.customer}
                  <small>
                    {o.city} · delivered {o.deliveredCycle}
                  </small>
                </div>
                <span className="mono owed-amt">{m(orderValue(o))}</span>
                {settle && (
                  <button type="button" className="btn xs" onClick={() => settleCash([o.id])}>
                    Cash received
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {desk.byCity.length > 0 && (
          <p style={{ margin: 0, padding: "10px 20px 14px", fontSize: 12, color: "var(--muted)" }}>
            <b style={{ color: "var(--ink-2)" }}>Owed by city:</b> {desk.byCity.map((c) => `${c.city} ${m(c.amount)} (${c.orders})`).join(" · ")}
          </p>
        )}
      </Card>

      <Card
        id="tour-payout"
        title="Payout desk"
        sub={nextText}
        actions={
          settle && (
            <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button type="button" className="btn sm" onClick={exportFile}>
                <Download size={13} /> Bank file
              </button>
              {cycle.status === "approved" && (
                <button type="button" className="btn primary sm" onClick={() => markPaid(cycle.id)}>
                  <CheckCircle2 size={13} /> Mark paid
                </button>
              )}
              {cycle.status === "paid" && (
                <button type="button" className="btn sm" onClick={() => lockCycle(cycle.id)}>
                  <Lock size={13} /> Lock cycle
                </button>
              )}
            </span>
          )
        }
        flush
      >
        <div className="filters" role="group" aria-label="Choose a week" style={{ padding: "10px 20px 0" }}>
          {data.cycles.map((c) => (
            <button key={c.id} type="button" className={"chip" + (c.id === cycleId ? " on" : "")} aria-pressed={c.id === cycleId} onClick={() => setPicked(c.id)}>
              {c.id} <span className="n">{STATUS_LABEL[c.status]}</span>
            </button>
          ))}
        </div>
        <div className="tbl-wrap">
          <table className="tbl" aria-label={`Payslips for ${cycleId}`}>
            <thead>
              <tr>
                <th>
                  {cycleId} · {shortDate(cycle.start)} – {shortDate(cycle.end)}
                </th>
                <th className="r">{L.fixedSalary}</th>
                <th className="r">{L.salesPay}</th>
                <th className="r">{L.payTakenBack}</th>
                <th className="r">Carried over</th>
                <th className="r">Net payable</th>
              </tr>
            </thead>
            <tbody>
              {slips.map(({ p, ps }) => (
                <tr key={p.id}>
                  <td>
                    <b>{p.name}</b>
                    <span className="sub">{p.title}</span>
                  </td>
                  <td className="r mono">{m(ps.base)}</td>
                  <td className="r mono">{m(ps.commission)}</td>
                  <td className={"r mono " + (ps.adjustments < 0 ? "neg" : "")}>{m(ps.adjustments)}</td>
                  <td className={"r mono " + (ps.carry < 0 ? "neg" : "")}>{m(ps.carry)}</td>
                  <td className="r mono">
                    <b>{m(ps.payable)}</b>
                  </td>
                </tr>
              ))}
              <tr className="is-total">
                <td>
                  <b>Total to pay</b>
                </td>
                <td colSpan={4} className="r muted">
                  A negative balance is never paid out; it carries into the next week.
                </td>
                <td className="r mono">
                  <b>{m(payable)}</b>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <LeaksPanel />
    </div>
  );
}
