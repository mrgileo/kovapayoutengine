"use client";

import { useState } from "react";
import { GitFork, Lock, Plus, RotateCcw, Search } from "lucide-react";
import {
  ACTION_LABEL,
  ActionKey,
  actionsFor,
  blockedNote,
  commissionLines,
  cycleById,
  firstName,
  isCredited,
  PERSONA,
  canSeeAllPayouts,
  openCycle,
  orderValue,
  ordersFor,
  personOf,
  productOf,
  stockRow,
  sum,
} from "@/lib/engine";
import { useData, useStore } from "@/lib/store";
import { L } from "@/lib/labels";
import { Card, Fig, StagePill, useMoney } from "./ui";
import type { Drill, Order } from "@/lib/types";

export function OrderLedger() {
  const data = useData();
  const role = useStore((s) => s.role);
  const act = useStore((s) => s.act);
  const setReturnFor = useStore((s) => s.setReturnFor);
  const setNewOrderOpen = useStore((s) => s.setNewOrderOpen);
  const imported = useStore((s) => s.dataSource) === "imported";
  const m = useMoney();

  const open = openCycle(data);
  const [cycleFilter, setCycleFilter] = useState<string>("OPEN");
  const [query, setQuery] = useState<string>("");

  const q = query.trim().toLowerCase();

  // Filter orders by cycle chip + live instant search
  const mine = ordersFor(data, role);
  const me = PERSONA[role];
  const visible = mine.filter((o) => {
    if (cycleFilter === "OPEN" && !(o.createdCycle === open.id || o.reversedCycle === open.id)) return false;
    if (cycleFilter === "DELIVERED" && o.stage !== "delivered") return false;
    if (cycleFilter === "RETURNED" && o.stage !== "returned") return false;
    if (q) {
      const p = productOf(data, o.sku);
      const cName = personOf(data, o.closer).name.toLowerCase();
      const oName = personOf(data, o.openedBy).name.toLowerCase();
      const hay = `#${o.id} ${o.customer} ${o.city} ${o.sku} ${p.name} ${o.stage} ${cName} ${oName}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  /** "Confirmed by Amaka": the latest thing someone did to this order, from the audit log. */
  function lastAction(o: Order): string | null {
    const e = data.audit.find((x) => x.orderId === o.id);
    if (!e) return null;
    const verb = /^Order \d+ (\w+)/.exec(e.text)?.[1] ?? (e.text.includes("created") ? "created" : null);
    if (!verb) return null;
    return `${verb.charAt(0).toUpperCase()}${verb.slice(1)} by ${firstName(data, e.actor)}`;
  }

  function handleAction(o: Order, a: ActionKey) {
    if (a === "return") {
      setReturnFor(o.id);
      return;
    }
    act(o.id, a);
  }

  function orderCommissionInfo(o: Order): { amount: number; label: string; tone: string; drill: Drill } {
    const val = orderValue(o);
    // Only the founder and accountant see what everyone earned on an order; others see their own share.
    const mineOnly = <T extends { personId: string }>(ls: T[]): T[] => (canSeeAllPayouts(role) ? ls : ls.filter((l) => l.personId === me));
    const lines = mineOnly(commissionLines(data, o, data.rules, o.creditedCycle ?? open.id));
    const total = sum(lines.map((l) => l.amount));
    const creditedNow = isCredited(o, data.rules);

    // Post-close return reversal check
    if ((o.stage === "returned" || o.stage === "cancelled") && o.creditedCycle) {
      const pc = cycleById(data, o.creditedCycle);
      const paidLines = mineOnly((pc?.lines ?? []).filter((l) => l.orderId === o.id && l.kind === "commission"));
      const paidAmt = sum(paidLines.map((l) => l.amount));
      if (pc?.status === "locked") {
        return {
          amount: paidAmt,
          label: `Kept (${pc.id} locked)`,
          tone: "warn",
          drill: {
            title: `Order #${o.id} · Post-Lock Return`,
            subtitle: `Counted in ${pc.id} (locked) · Commission is final`,
            lines: paidLines.map((l) => ({
              ref: pc.id,
              label: personOf(data, l.personId).name,
              detail: l.note,
              amount: l.amount,
            })),
            total: paidAmt,
          },
        };
      }
      if (data.rules.onReturn === "clawback") {
        return {
          amount: -paidAmt,
          label: `Customer refunded (${pc?.id})`,
          tone: "neg",
          drill: {
            title: `Order #${o.id} · Customer refunded`,
            subtitle: `Paid in ${pc?.id} · Returned in ${open.id}`,
            lines: paidLines.map((l) => ({
              ref: "TAKEN BACK",
              label: personOf(data, l.personId).name,
              detail: `Taken back in ${open.id}`,
              amount: -l.amount,
            })),
            total: -paidAmt,
          },
        };
      }
      if (data.rules.onReturn === "offset") {
        return {
          amount: -paidAmt,
          label: `Taken back next week`,
          tone: "warn",
          drill: {
            title: `Order #${o.id} · Customer refunds to take off next week`,
            subtitle: `Paid in ${pc?.id} · Taken back when next week closes`,
            lines: paidLines.map((l) => ({
              ref: "NEXT WEEK",
              label: personOf(data, l.personId).name,
              detail: `To be taken back next week`,
              amount: -l.amount,
            })),
            total: -paidAmt,
          },
        };
      }
    }

    return {
      amount: creditedNow ? total : 0,
      label: o.creditedCycle ? `Paid in ${o.creditedCycle}` : creditedNow ? "Earned this week" : "Not earned yet",
      tone: creditedNow ? "pos" : "muted",
      drill: {
        title: `Order #${o.id} · Commission split`,
        subtitle: `${o.customer} · Order value ${m(val)}`,
        lines: lines.map((l) => ({
          ref: personOf(data, l.personId).role.toUpperCase(),
          label: personOf(data, l.personId).name,
          detail: l.note,
          amount: creditedNow ? l.amount : 0,
        })),
        total: creditedNow ? total : 0,
      },
    };
  }

  return (
    <Card
      title={role === "closer" ? "Your orders" : role === "buyer" ? "Orders from your ads" : "Manage Orders"}
      sub={
        role === "closer"
          ? "Your orders as cards. You earn commission once the warehouse marks an order delivered."
          : role === "buyer"
            ? "Every order your ads brought in, and where it is now."
            : "Move each order forward, or mark one returned if it comes back."
      }
      actions={
        <div className="filters" role="group" aria-label="Filter orders" style={{ alignItems: "center" }}>
          <label className="search-box">
            <Search size={12} />
            <input
              type="search"
              placeholder="Search #id, customer, SKU…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search orders"
            />
          </label>
          {[
            { id: "OPEN", label: `Current (${open.id})`, count: mine.filter((o) => o.createdCycle === open.id || o.reversedCycle === open.id).length },
            { id: "DELIVERED", label: "Delivered", count: mine.filter((o) => o.stage === "delivered").length },
            { id: "RETURNED", label: "Returned", count: mine.filter((o) => o.stage === "returned").length },
            { id: "ALL", label: "All weeks", count: mine.length },
          ].map((f) => (
            <button
              key={f.id}
              type="button"
              className="chip"
              aria-pressed={cycleFilter === f.id}
              onClick={() => setCycleFilter(f.id)}
            >
              {f.label} <span className="n">{f.count}</span>
            </button>
          ))}
          {(role === "founder" || role === "closer" || role === "lead") && (
            <button
              type="button"
              className="btn xs primary"
              onClick={() => setNewOrderOpen(true)}
              style={{ marginLeft: 4 }}
            >
              <Plus size={12} /> New lead
            </button>
          )}
        </div>
      }
      flush
    >
      {role === "closer" ? (
        <div className="ocards">
          {visible.map((o) => {
            const val = orderValue(o);
            const p = productOf(data, o.sku);
            const sr = stockRow(data, p);
            const thin = sr.available <= 0 && o.stage !== "delivered" && o.stage !== "returned" && o.stage !== "cancelled";
            const acts = actionsFor(data, role, o);
            const note = blockedNote(role, o);
            const comm = orderCommissionInfo(o);
            const myLines = commissionLines(data, { ...o, stage: "delivered", cashIn: true }, data.rules, open.id).filter(
              (l) => l.personId === me,
            );
            const myShare = sum(myLines.map((l) => l.amount));
            const isSplit = o.openedBy !== o.closer;

            return (
              <article className="ocard" key={o.id}>
                <div className="ocard-top">
                  <div>
                    <b>
                      <span className="mono">#{o.id}</span> · {o.customer}
                    </b>
                    <span>
                      {o.city} · <span className="sku">{o.sku}</span> ×{o.qty} ({p.name})
                    </span>
                  </div>
                  <div className="ocard-val">
                    <span className="big">{m(val)}</span>
                  </div>
                </div>

                <div className="ocard-mid">
                  <StagePill stage={o.stage} failed={o.failed} cashIn={o.cashIn} />
                  <span className="pill plain">{o.createdCycle}</span>
                  {thin && <span className="pill neg">No stock</span>}
                  {isSplit && (
                    <span className="pill info">
                      <GitFork size={11} /> {firstName(data, o.openedBy)} → {firstName(data, o.closer)}
                    </span>
                  )}
                </div>

                <div className="ocard-earn">
                  <span>Your commission ({isCredited(o, data.rules) ? "credited" : "when delivered"}):</span>
                  <b className={isCredited(o, data.rules) ? "pos" : ""}>
                    <Fig amount={myShare} drill={comm.drill} />
                  </b>
                </div>

                {note && (
                  <div className="ocard-note">
                    <Lock size={13} style={{ flex: "none", marginTop: 2 }} />
                    <span>{note}</span>
                  </div>
                )}

                {acts.length > 0 && (
                  <div className="acts">
                    {acts.map((a) =>
                      a === "return" ? (
                        <button key={a} type="button" className="link-quiet" onClick={() => handleAction(o, a)}>
                          {ACTION_LABEL[a]}
                        </button>
                      ) : (
                        <button
                          key={a}
                          type="button"
                          className={"btn sm " + (a === "confirm" || a === "deliver" ? "primary" : a === "cancel" || a === "fail" ? "danger" : "")}
                          onClick={() => handleAction(o, a)}
                        >
                          {ACTION_LABEL[a]}
                        </button>
                      ),
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Order</th>
                <th>Customer</th>
                <th>Item &amp; stock</th>
                <th>Opened / closed by</th>
                <th className="r">Value</th>
                <th>Stage</th>
                {role !== "stock" && <th className="r">{canSeeAllPayouts(role) ? "Commission" : "Your commission"}</th>}
                <th className="r">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((o) => {
                const val = orderValue(o);
                const p = productOf(data, o.sku);
                const sr = stockRow(data, p);
                const thin = sr.available <= 0 && o.stage !== "delivered" && o.stage !== "returned" && o.stage !== "cancelled";
                const acts = actionsFor(data, role, o);
                const comm = orderCommissionInfo(o);
                const isSplit = o.openedBy !== o.closer;

                return (
                  <tr key={o.id} className={isSplit ? "hl" : ""}>
                    <td>
                      <b className="mono">#{o.id}</b>
                      <span className="sub">
                        {o.createdCycle}
                        {o.creditedCycle ? ` · paid ${o.creditedCycle}` : ""}
                      </span>
                    </td>
                    <td>
                      <b>{o.customer}</b>
                      <span className="sub">{o.city}</span>
                    </td>
                    <td>
                      <span className="sku">{o.sku}</span> ×{o.qty}
                      {thin && (
                        <span className="pill neg" style={{ marginLeft: 6 }}>
                          no stock
                        </span>
                      )}
                      <span className="sub">{p.name}</span>
                    </td>
                    <td>
                      {isSplit ? (
                        <div>
                          <span className="pill info" style={{ marginBottom: 3 }}>
                            <GitFork size={11} /> {firstName(data, o.openedBy)} opened → {firstName(data, o.closer)} closed
                          </span>
                          <span className="sub">
                            {o.campaign ? `${o.campaign} · ` : ""}{firstName(data, o.buyer)}
                          </span>
                        </div>
                      ) : (
                        <div>
                          <b>{firstName(data, o.closer)}</b>
                          <span className="sub">
                            {o.campaign ? `${o.campaign} · ` : ""}{firstName(data, o.buyer)}
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="r mono">
                      <b>{m(val)}</b>
                    </td>
                    <td>
                      <StagePill stage={o.stage} failed={o.failed} cashIn={o.cashIn} />
                      {lastAction(o) && <span className="sub">{lastAction(o)}</span>}
                    </td>
                    {role !== "stock" && <td className="r mono">
                      {comm.amount !== 0 ? (
                        <div>
                          <b className={comm.amount < 0 ? "neg" : comm.tone === "pos" ? "pos" : ""}>
                            <Fig amount={comm.amount} sign={comm.amount < 0} drill={comm.drill} />
                          </b>
                          <span className="sub">{comm.label}</span>
                        </div>
                      ) : (
                        <div>
                          <Fig amount={0} drill={comm.drill}>
                            —
                          </Fig>
                          <span className="sub">{comm.label}</span>
                        </div>
                      )}
                    </td>}
                    <td className="r">
                      {acts.length > 0 ? (
                        <div className="acts">
                          {acts.map((a) =>
                            a === "return" ? (
                              <button key={a} type="button" className="link-quiet" onClick={() => handleAction(o, a)}>
                                {ACTION_LABEL[a]}
                              </button>
                            ) : (
                              <button
                                key={a}
                                type="button"
                                className={"btn xs " + (a === "deliver" || a === "confirm" || a === "dispatch" ? "primary" : a === "fail" || a === "cancel" ? "danger" : "")}
                                onClick={() => handleAction(o, a)}
                              >
                                {ACTION_LABEL[a]}
                              </button>
                            ),
                          )}
                        </div>
                      ) : (
                        <span className="muted" style={{ fontSize: 12 }}>
                          {blockedNote(role, o) ? "Warehouse only" : "—"}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
