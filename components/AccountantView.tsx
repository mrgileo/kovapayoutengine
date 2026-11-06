"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, Lock, Wallet } from "lucide-react";
import { canSettle, cashDesk, computePnl, cycleLines, orderValue, payoutCsv, payoutQueue, payslip, salesPeople, sum } from "@/lib/engine";
import { cashDeskOf, payoutQueueOf, pnlOf } from "@/lib/derived";
import { downloadText } from "@/lib/download";
import { L } from "@/lib/labels";
import { shortDate } from "@/lib/format";
import { useData, useStore } from "@/lib/store";
import { askLockCycle, askMarkPaid, askSettleCash } from "@/lib/askActions";
import { matchesQuery } from "@/lib/sort";
import { LeaksPanel } from "./RevenueFlow";
import { Card, Fig, Tile, useMoney } from "./ui";
import { NoMatches, ScrollTable, SearchBox, SortTh, TableTools, useSortable, type Col } from "./table";

const STATUS_LABEL = { open: "Accruing", approved: "Approved, awaiting payment", paid: "Paid", locked: "Locked" } as const;
const weeks = (n: number) => (n === 0 ? "This week" : `${n} week${n === 1 ? "" : "s"}`);

/** The accountant's desk: courier cash to chase, and approved pay to execute. They cannot change orders, prices or rules. */
export function AccountantView() {
  const data = useData();
  const role = useStore((s) => s.role);
  const settleCash = askSettleCash;
  const markPaid = askMarkPaid;
  const lockCycle = askLockCycle;
  const toast = useStore((s) => s.toast);
  const m = useMoney();

  const desk = cashDeskOf(data);
  const queue = payoutQueueOf(data);
  const pnl = pnlOf(data);
  const settle = canSettle(role);

  const defaultCycle = queue.next.kind === "wait" ? (data.cycles.filter((c) => c.status !== "open").at(-1)?.id ?? queue.next.cycleId) : queue.next.cycleId;
  const [picked, setPicked] = useState<string | null>(null);
  const cycleId = picked && data.cycles.some((c) => c.id === picked) ? picked : defaultCycle;
  const cycle = data.cycles.find((c) => c.id === cycleId)!;
  // Worked out once per week picked, not on every click or keystroke.
  const slips = useMemo(() => {
    const lines = cycleLines(data, cycleId);
    return salesPeople(data).map((p) => ({ p, ps: payslip(lines, p.id) }));
  }, [data, cycleId]);
  const payable = sum(slips.map((x) => x.ps.payable));

  const [slipQ, setSlipQ] = useState("");
  const slipsShown = useMemo(() => slips.filter(({ p }) => matchesQuery(slipQ, `${p.name} ${p.title}`)), [slips, slipQ]);
  const slipCols: Col<(typeof slips)[number]>[] = [
    { key: "name", label: `${cycleId} · ${shortDate(cycle.start)} – ${shortDate(cycle.end)}`, get: (x) => x.p.name },
    { key: "base", label: L.fixedSalary, get: (x) => x.ps.base, align: "r", first: "desc" },
    { key: "sales", label: L.salesPay, get: (x) => x.ps.commission, align: "r", first: "desc" },
    { key: "back", label: L.payTakenBack, get: (x) => x.ps.adjustments, align: "r" },
    { key: "carry", label: "Carried over", get: (x) => x.ps.carry, align: "r" },
    { key: "net", label: "Net payable", get: (x) => x.ps.payable, align: "r", first: "desc" },
  ];
  const slipSort = useSortable(slipsShown, slipCols);

  const cashCols: Col<(typeof desk.rows)[number]>[] = [
    { key: "week", label: "Week", get: (r) => r.cycleId, first: "desc" },
    { key: "orders", label: "Orders", get: (r) => r.orders, align: "r", first: "desc" },
    { key: "delivered", label: "Delivered", get: (r) => r.delivered, align: "r", first: "desc" },
    { key: "received", label: "Cash received", get: (r) => r.received, align: "r", first: "desc" },
    { key: "owed", label: "Still owed", get: (r) => r.outstanding, align: "r", first: "desc" },
    { key: "age", label: "Age", get: (r) => (r.outstanding > 0 ? r.ageWeeks : null), first: "desc" },
  ];
  const cashSort = useSortable(desk.rows, cashCols);

  // Orders still owed can run to thousands: search them, and show them a page at a time.
  const [owedQ, setOwedQ] = useState("");
  const [owedMax, setOwedMax] = useState(50);
  const owedShown = useMemo(() => desk.outstanding.filter((o) => matchesQuery(owedQ, `#${o.id} ${o.customer} ${o.city} ${o.deliveredCycle}`)), [desk.outstanding, owedQ]);

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
          note={queue.awaitingPayment.length ? `Approved by the founder: ${queue.awaitingPayment.map((x) => x.cycleId).join(", ")}` : "Nothing approved yet"}
          tone={awaiting > 0 ? "warn" : "pos"}
        >
          <span className="num">{m(awaiting)}</span>
        </Tile>
        <Tile
          label="Paid, ready to lock"
          note={queue.readyToLock.length ? `${queue.readyToLock.map((x) => x.cycleId).join(", ")} is paid and can be locked` : "No paid week is waiting to be locked"}
        >
          <span className="num">{queue.readyToLock.length}</span>
        </Tile>
        <Tile label={L.revenue} note={`Delivered in ${pnl.cycleId}`}>
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
        <ScrollTable rows={8}>
          <table className="tbl" aria-label="Cash by week">
            <thead>
              <tr>
                <SortTh s={cashSort} col="week" />
                <SortTh s={cashSort} col="orders" className="hide-sm" />
                <SortTh s={cashSort} col="delivered" className="hide-sm" />
                <SortTh s={cashSort} col="received" className="hide-sm" />
                <SortTh s={cashSort} col="owed" />
                <SortTh s={cashSort} col="age" />
              </tr>
            </thead>
            <tbody>
              {cashSort.sorted.map((r) => (
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
        </ScrollTable>

        {desk.outstanding.length > 0 && (
          <div className="filters" style={{ padding: "10px 20px 0", alignItems: "center", justifyContent: "space-between" }}>
            <b style={{ fontSize: 12.5 }}>Orders still owed ({desk.outstanding.length.toLocaleString()})</b>
            <SearchBox value={owedQ} onChange={(v) => { setOwedQ(v); setOwedMax(50); }} label="Search orders still owed" placeholder="Search #id, customer, city…" />
          </div>
        )}
        {owedShown.length === 0 && owedQ.trim() ? <NoMatches query={owedQ} /> : null}
        {desk.outstanding.length > 0 && (
          <ul className="owed" aria-label="Orders still owed">
            {owedShown.slice(0, owedMax).map((o) => (
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
        {owedShown.length > owedMax && (
          <div style={{ padding: "8px 20px 4px" }}>
            <button type="button" className="btn xs" onClick={() => setOwedMax((n) => n + 50)}>
              Show 50 more ({(owedShown.length - owedMax).toLocaleString()} not shown)
            </button>
          </div>
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
                  <Lock size={13} /> Lock week
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
        {slips.length > 5 && (
          <div className="filters" style={{ padding: "10px 20px 0", alignItems: "center" }}>
            <TableTools query={slipQ} onQuery={setSlipQ} sorter={slipSort} label="Search staff" placeholder="Search staff…" />
          </div>
        )}
        {slipsShown.length === 0 && slipQ.trim() ? <NoMatches query={slipQ} /> : null}
        <ScrollTable rows={9}>
          <table className="tbl" aria-label={`Payslips for ${cycleId}`}>
            <thead>
              <tr>
                {slipCols.map((c) => (
                  <SortTh key={c.key} s={slipSort} col={c.key} />
                ))}
              </tr>
            </thead>
            <tbody>
              {slipSort.sorted.map(({ p, ps }) => (
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
        </ScrollTable>
      </Card>

      <LeaksPanel />
    </div>
  );
}
