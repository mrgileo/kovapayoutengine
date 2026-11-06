"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { GitFork, Lock, Plus } from "lucide-react";
import {
  ACTION_LABEL,
  ActionKey,
  actionsFor,
  blockedNote,
  commissionLines,
  cycleById,
  firstName,
  isCredited,
  canSeeAllPayouts,
  openCycle,
  orderValue,
  ordersFor,
  personOf,
  productOf,
  stockRow,
  sum,
} from "@/lib/engine";
import { useData, useMe, useStore } from "@/lib/store";
import { askOrder } from "@/lib/askActions";
import { L } from "@/lib/labels";
import { stockRowsOf } from "@/lib/derived";
import { matchesQuery } from "@/lib/sort";
import { Card, Fig, StagePill, useMoney } from "./ui";
import { NoMatches, SearchBox, SortSelect, SortTh, useSortable, type Col } from "./table";
import type { Drill, Order } from "@/lib/types";

const STAGE_ORDER = ["new", "confirmed", "dispatched", "delivered", "returned", "cancelled"];

export function OrderLedger() {
  const data = useData();
  const role = useStore((s) => s.role);
  const setNewOrderOpen = useStore((s) => s.setNewOrderOpen);
  const imported = useStore((s) => s.dataSource) === "imported";
  const m = useMoney();

  const open = openCycle(data);
  const [cycleFilter, setCycleFilter] = useState<string>("OPEN");
  const [query, setQuery] = useState<string>("");

  // Typing stays instant; the 20,000-row filter below runs on the deferred copy.
  const deferredQuery = useDeferredValue(query);
  const stockBySku = useMemo(() => new Map(stockRowsOf(data).map((r) => [r.product.sku, r])), [data]);

  // Which orders this person sees, then the cycle chip, then the search.
  const me = useMe();
  const mine = useMemo(() => ordersFor(data, role, me), [data, role, me]);
  const names = useMemo(
    () => ({
      product: new Map(data.products.map((p) => [p.sku, p.name])),
      person: new Map(data.people.map((p) => [p.id, p.name])),
    }),
    [data.products, data.people],
  );
  const counts = useMemo(
    () => ({
      OPEN: mine.filter((o) => o.createdCycle === open.id || o.reversedCycle === open.id).length,
      DELIVERED: mine.filter((o) => o.stage === "delivered").length,
      RETURNED: mine.filter((o) => o.stage === "returned").length,
      ALL: mine.length,
    }),
    [mine, open.id],
  );
  const visible = useMemo(
    () =>
      mine.filter((o) => {
        if (cycleFilter === "OPEN" && !(o.createdCycle === open.id || o.reversedCycle === open.id)) return false;
        if (cycleFilter === "DELIVERED" && o.stage !== "delivered") return false;
        if (cycleFilter === "RETURNED" && o.stage !== "returned") return false;
        if (deferredQuery.trim()) {
          const hay = `#${o.id} ${o.customer} ${o.city} ${o.sku} ${names.product.get(o.sku) ?? ""} ${o.stage} ${names.person.get(o.closer) ?? ""} ${names.person.get(o.openedBy) ?? ""}`;
          if (!matchesQuery(deferredQuery, hay)) return false;
        }
        return true;
      }),
    [mine, cycleFilter, deferredQuery, open.id, names],
  );

  // Closers can read their orders as cards or as a compact table; the choice is remembered for that person on this device.
  const [viewPick, setViewPick] = useState<"cards" | "table" | null>(null);
  useEffect(() => {
    try {
      const v = localStorage.getItem(`kova.ordersView.${me}`);
      if (v === "cards" || v === "table") setViewPick(v);
    } catch {}
  }, [me]);
  const view = role === "closer" ? (viewPick ?? "cards") : "table";
  function pickView(v: "cards" | "table") {
    setViewPick(v);
    try {
      localStorage.setItem(`kova.ordersView.${me}`, v);
    } catch {}
  }

  const cols: Col<Order>[] = [
    { key: "id", label: "Order", get: (o) => o.id, first: "desc" },
    { key: "customer", label: "Customer", get: (o) => o.customer },
    { key: "item", label: "Item & stock", get: (o) => o.sku },
    { key: "by", label: "Opened / closed by", get: (o) => names.person.get(o.closer) },
    { key: "value", label: "Value", get: (o) => orderValue(o), align: "r", first: "desc" },
    { key: "stage", label: "Stage", get: (o) => STAGE_ORDER.indexOf(o.stage) },
    ...(role !== "stock"
      ? [{ key: "commission", label: canSeeAllPayouts(role) ? "Commission" : "Your commission", get: (o: Order) => orderCommissionInfo(o).amount, align: "r" as const, first: "desc" as const }]
      : []),
  ];
  const sorter = useSortable(visible, cols);

  /** "Confirmed by Amaka": the latest thing someone did to this order, from the audit log. */
  function lastAction(o: Order): string | null {
    const e = data.audit.find((x) => x.orderId === o.id);
    if (!e) return null;
    const verb = /^Order \d+ (\w+)/.exec(e.text)?.[1] ?? (e.text.includes("created") ? "created" : null);
    if (!verb) return null;
    return `${verb.charAt(0).toUpperCase()}${verb.slice(1)} by ${firstName(data, e.actor)}${e.note ? ` · “${e.note}”` : ""}`;
  }

  // A medium company has tens of thousands of orders: show one page at a time.
  const PAGE = 50;
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [cycleFilter, deferredQuery, role, sorter.key, sorter.dir]);
  const pages = Math.max(1, Math.ceil(visible.length / PAGE));
  const shown = sorter.sorted.slice(Math.min(page, pages - 1) * PAGE, Math.min(page, pages - 1) * PAGE + PAGE);

  function handleAction(o: Order, a: ActionKey) {
    askOrder(o.id, a);
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
          <SearchBox value={query} onChange={setQuery} label="Search orders" placeholder="Search #id, customer, SKU…" />
          <SortSelect s={sorter} />
          {[
            { id: "OPEN", label: `Current (${open.id})`, count: counts.OPEN },
            { id: "DELIVERED", label: "Delivered", count: counts.DELIVERED },
            { id: "RETURNED", label: "Returned", count: counts.RETURNED },
            { id: "ALL", label: "All weeks", count: counts.ALL },
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
          {role === "closer" && (
            <span className="view-toggle" role="group" aria-label="How to show your orders">
              <button type="button" className="chip" aria-pressed={view === "cards"} onClick={() => pickView("cards")}>
                Cards
              </button>
              <button type="button" className="chip" aria-pressed={view === "table"} onClick={() => pickView("table")}>
                Table
              </button>
            </span>
          )}
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
      {visible.length === 0 && query.trim() ? <NoMatches query={query} /> : null}
      {view === "cards" ? (
        <div className="ocards">
          {shown.map((o) => {
            const val = orderValue(o);
            const p = productOf(data, o.sku);
            const sr = stockBySku.get(o.sku) ?? stockRow(data, p);
            const thin = sr.available <= 0 && o.stage !== "delivered" && o.stage !== "returned" && o.stage !== "cancelled";
            const acts = actionsFor(data, role, o, me);
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
                <SortTh s={sorter} col="id" />
                <SortTh s={sorter} col="customer" />
                <SortTh s={sorter} col="item" />
                <SortTh s={sorter} col="by" />
                <SortTh s={sorter} col="value" />
                <SortTh s={sorter} col="stage" />
                {role !== "stock" && <SortTh s={sorter} col="commission" />}
                <th className="r">Actions</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((o) => {
                const val = orderValue(o);
                const p = productOf(data, o.sku);
                const sr = stockBySku.get(o.sku) ?? stockRow(data, p);
                const thin = sr.available <= 0 && o.stage !== "delivered" && o.stage !== "returned" && o.stage !== "cancelled";
                const acts = actionsFor(data, role, o, me);
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
      {visible.length > PAGE && (
        <nav className="pager" aria-label="Order pages">
          <span>
            Showing {(Math.min(page, pages - 1) * PAGE + 1).toLocaleString()}–{(Math.min(page, pages - 1) * PAGE + shown.length).toLocaleString()} of {visible.length.toLocaleString()}
          </span>
          <span className="pager-btns">
            <button type="button" className="btn xs" disabled={page <= 0} onClick={() => setPage((x) => Math.max(0, x - 1))}>
              Previous
            </button>
            <button type="button" className="btn xs" disabled={page >= pages - 1} onClick={() => setPage((x) => Math.min(pages - 1, x + 1))}>
              Next
            </button>
          </span>
        </nav>
      )}
    </Card>
  );
}
