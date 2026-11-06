"use client";

import { useMemo } from "react";
import { SIM_FEED_NOTE, cycleLines, openCycle, openLines, orderValue, payslip, personOf, sum } from "@/lib/engine";
import { linesOf } from "@/lib/derived";
import { shortDate } from "@/lib/format";
import { L, PAY_LINE_TEXT } from "@/lib/labels";
import { useData, useMe } from "@/lib/store";
import { CloserScorecard } from "./CloserScorecard";
import { Card, Fig, Tile } from "./ui";
import { ScrollTable, SortSelect, SortTh, useSortable, type Col } from "./table";
import type { Drill } from "@/lib/types";

/** The media buyer sees only their own spend, the orders their ads brought in, and their own pay. No company accounting. */
export function BuyerView() {
  const data = useData();
  const me = useMe();
  const open = openCycle(data);
  const ps = payslip(linesOf(data), me);
  const myOrders = useMemo(() => data.orders.filter((o) => o.buyer === me), [data.orders, me]);
  const thisWeek = myOrders.filter((o) => o.createdCycle === open.id);
  const spendNow = data.spend[open.id]?.[me] ?? 0;

  const payLines = (slip: ReturnType<typeof payslip>) =>
    slip.lines.map((l) => ({
      ref: l.orderId ? `#${l.orderId}` : l.kind.toUpperCase(),
      label: l.kind === "base" ? PAY_LINE_TEXT.base : l.kind === "commission" ? PAY_LINE_TEXT.commission(l.orderId) : PAY_LINE_TEXT.adjustment(l.kind),
      detail: l.note,
      amount: l.amount,
    }));
  const spendDrill = (cycle: string, amount: number): Drill => ({
    title: `${cycle} · Your ad spend`,
    lines: [{ ref: "Sim. feed", label: "Ad spend", detail: SIM_FEED_NOTE, amount }],
    total: amount,
  });

  // One row per week: what I spent, the orders my ads brought in, how many were delivered, and what I was paid.
  const weeks = useMemo(() => {
    // One pass over this buyer's orders, grouped by week, instead of one filter per week.
    const byWeek = new Map<string, typeof myOrders>();
    for (const o of myOrders) {
      const list = byWeek.get(o.createdCycle);
      if (list) list.push(o);
      else byWeek.set(o.createdCycle, [o]);
    }
    return [...data.cycles].reverse().map((c) => {
      const ords = byWeek.get(c.id) ?? [];
      return {
        c,
        ords,
        value: sum(ords.map(orderValue)),
        delivered: ords.filter((o) => o.stage === "delivered").length,
        spend: data.spend[c.id]?.[me] ?? 0,
        slip: payslip(cycleLines(data, c.id), me),
      };
    });
  }, [data, myOrders, me]);
  const weekCols: Col<(typeof weeks)[number]>[] = [
    { key: "week", label: "Week", get: (w) => w.c.id, first: "desc" },
    { key: "spend", label: "Ad spend", get: (w) => w.spend, align: "r", first: "desc" },
    { key: "orders", label: "Orders from your ads", get: (w) => w.value, align: "r", first: "desc" },
    { key: "delivered", label: "Delivered", get: (w) => w.delivered, align: "r", first: "desc" },
    { key: "pay", label: "Your pay", get: (w) => w.slip.payable, align: "r", first: "desc" },
  ];
  const weekSort = useSortable(weeks, weekCols);

  return (
    <div className="stack">
      <dl className="tiles">
        <Tile label="Ad spend this week" note={`${L.simulatedFeed} · ${open.id}`}>
          <Fig amount={spendNow} drill={spendDrill(open.id, spendNow)} />
        </Tile>
        <Tile label="Orders from your ads" note={`${thisWeek.filter((o) => o.stage === "delivered").length} delivered so far in ${open.id}`}>
          <span className="num">{thisWeek.length}</span>
        </Tile>
        <Tile label="Your pay this week" note="Fixed salary + commission on delivered orders" tone="pos">
          <Fig
            amount={ps.payable}
            drill={{ title: `${open.id} · Your pay`, subtitle: "Fixed salary + commission on delivered orders from your ads", lines: payLines(ps), total: ps.gross }}
          />
        </Tile>
      </dl>

      <Card
        title="Your weeks"
        sub="What you spent, the orders your ads brought in, and what you were paid. Only your own numbers are shown."
        actions={weeks.length > 4 ? <SortSelect s={weekSort} /> : undefined}
        flush
      >
        <ScrollTable rows={8}>
          <table className="tbl">
            <thead>
              <tr>
                {weekCols.map((c) => (
                  <SortTh key={c.key} s={weekSort} col={c.key} />
                ))}
              </tr>
            </thead>
            <tbody>
              {weekSort.sorted.map(({ c, ords, value, delivered, spend, slip }) => {
                return (
                  <tr key={c.id}>
                    <td>
                      <b>{c.id}</b>
                      <span className="sub">{c.id === open.id ? "This week" : `${shortDate(c.start)} – ${shortDate(c.end)}`}</span>
                    </td>
                    <td className="r mono">
                      <Fig amount={spend} drill={spendDrill(c.id, spend)} />
                    </td>
                    <td className="r mono">
                      <Fig
                        amount={value}
                        drill={() => ({
                          title: `${c.id} · Orders from your ads`,
                          lines: ords.map((o) => ({ ref: `#${o.id}`, label: `${o.customer} (${L.stage[o.stage] ?? o.stage})`, amount: orderValue(o) })),
                          total: value,
                        })}
                      />
                      <span className="sub">
                        {ords.length} order{ords.length === 1 ? "" : "s"}
                      </span>
                    </td>
                    <td className="r mono">{delivered}</td>
                    <td className="r mono">
                      <b>
                        <Fig amount={slip.payable} drill={() => ({ title: `${c.id} · Your pay`, lines: payLines(slip), total: slip.gross })} />
                      </b>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </ScrollTable>
      </Card>
    </div>
  );
}

export function LeadView() {
  const data = useData();
  const me = useMe();
  const open = openCycle(data);
  const lines = linesOf(data);
  const ps = payslip(lines, me);

  const myTeam = new Set(data.people.filter((p) => p.role === "closer" && p.reportsTo === me).map((p) => p.id));
  const teamDelivered = data.orders.filter((o) => o.deliveredCycle === open.id && o.stage === "delivered" && myTeam.has(o.closer));
  const teamDelVal = sum(teamDelivered.map(orderValue));
  const splitOrders = data.orders.filter((o) => o.openedBy !== o.closer && myTeam.has(o.closer));

  const payslipDrill: Drill = {
    title: `Ngozi Eze · ${open.id} Team Lead Payslip`,
    subtitle: "Team bonus on team sales + fixed salary (one week's share)",
    lines: ps.lines.map((l) => ({
      ref: l.orderId ? `#${l.orderId}` : l.kind.toUpperCase(),
      label: l.kind === "base" ? PAY_LINE_TEXT.base : PAY_LINE_TEXT.commission(l.orderId),
      detail: l.note,
      amount: l.amount,
    })),
    total: ps.gross,
  };

  return (
    <div className="stack">
      <dl className="tiles">
        <Tile label="Team lead net payout" note="Fixed salary + team bonus" tone="pos">
          <Fig amount={ps.payable} drill={payslipDrill} />
        </Tile>
        <Tile label={L.teamBonus} note="Earned on the team's delivered sales, after any customer refunds">
          <Fig amount={ps.commission + ps.adjustments} drill={payslipDrill} />
        </Tile>
        <Tile label="Team delivered sales" note={`${teamDelivered.length} orders delivered in ${open.id}`}>
          <Fig
            amount={teamDelVal}
            drill={{
              title: `Team Delivered Volume · ${open.id}`,
              lines: teamDelivered.map((o) => ({
                ref: `#${o.id}`,
                label: `${o.customer} · closed by ${personOf(data, o.closer).name}`,
                amount: orderValue(o),
              })),
              total: teamDelVal,
            }}
          />
        </Tile>
        <Tile
          label="Orders two closers worked on"
          note={`Closer pay goes to ${data.rules.split === "first" ? "whoever opened the order" : data.rules.split === "last" ? "whoever closed it" : "both, 50-50"}`}
        >
          <span className="num">{splitOrders.length}</span>
        </Tile>
      </dl>

      <CloserScorecard />
    </div>
  );
}
