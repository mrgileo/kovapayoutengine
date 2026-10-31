"use client";

import { SIM_FEED_NOTE, campaignStats, openCycle, openLines, orderValue, payslip, personOf, sum } from "@/lib/engine";
import { L, PAY_LINE_TEXT } from "@/lib/labels";
import { useData } from "@/lib/store";
import { AdBudget } from "./AdBudget";
import { CloserScorecard } from "./CloserScorecard";
import { Avatar, Card, Fig, Tile } from "./ui";
import type { Drill } from "@/lib/types";

export function BuyerView() {
  const data = useData();
  const open = openCycle(data);
  const lines = openLines(data);
  const ps = payslip(lines, "tobi");
  const cs = campaignStats(data, "tobi");

  const myOrders = data.orders.filter((o) => o.buyer === "tobi" && o.createdCycle === open.id);
  const delivered = myOrders.filter((o) => o.stage === "delivered");

  const payslipDrill: Drill = {
    title: `Tobi Ade · ${open.id} Payslip Breakdown`,
    subtitle: "Media buyer",
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
        <Tile label="Net payout this week" note="Fixed salary + commission on counted orders" tone="pos">
          <Fig amount={ps.payable} drill={payslipDrill} />
        </Tile>
        <Tile label="Ad spend" note={`${L.simulatedFeed} · ${open.id}`}>
          <Fig
            amount={cs.spend}
            drill={{
              title: `Tobi Ade · ${open.id} Ad Spend`,
              lines: [{ ref: "Sim. feed", label: "Ad spend", detail: SIM_FEED_NOTE, amount: cs.spend }],
              total: cs.spend,
            }}
          />
        </Tile>
        <Tile
          label="Delivered revenue"
          note={`${delivered.length} of ${myOrders.length} orders delivered`}
        >
          <Fig
            amount={cs.deliveredRev}
            drill={{
              title: "Delivered revenue",
              lines: delivered.map((o) => ({
                ref: `#${o.id}`,
                label: `${o.customer} · ${o.sku} ×${o.qty}`,
                detail: o.cashIn ? "Cash received" : "Cash still with the courier",
                amount: orderValue(o),
              })),
              total: cs.deliveredRev,
            }}
          />
        </Tile>
        <Tile
          label={L.salesPerAdNaira}
          note={`Booked orders suggest ${L.perNaira(cs.bookedRoas)}, but returns and undelivered orders bring it down`}
          tone={cs.deliveredRoas < 2 ? "neg" : "pos"}
        >
          <span className="num">{L.perNaira(cs.deliveredRoas)}</span>
        </Tile>
        <Tile
          label="Left after product, ads, pay"
          note="After product cost, ads, delivery fees and commission"
          tone={cs.netMargin < 0 ? "neg" : "pos"}
        >
          <Fig amount={cs.netMargin} sign drill={cs.marginDrill} />
        </Tile>
      </dl>

      <AdBudget />

      <Card
        title="Campaign results · booked sales vs what's really left"
        sub="Ad managers report sales per ₦1 of ads on orders booked. You pay the bills from what's left after product cost, delivery fees, commission and ads."
        flush
      >
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Media buyer</th>
                <th className="r">Ad spend</th>
                <th className="r">Booked vol.</th>
                <th className="r">{L.bookedSalesPerAdNaira}</th>
                <th className="r">Delivered rev.</th>
                <th className="r">{L.deliveredSalesPerAdNaira}</th>
                <th className="r">Left after product, ads, pay</th>
                <th className="r">Pay this week</th>
              </tr>
            </thead>
            <tbody>
              {data.people.filter((p) => p.role === "buyer").map((b) => b.id).map((id) => {
                const p = personOf(data, id);
                const c = campaignStats(data, id);
                const ords = data.orders.filter((o) => o.buyer === id && o.createdCycle === open.id);
                const del = ords.filter((o) => o.stage === "delivered");
                const slip = payslip(lines, id);
                return (
                  <tr key={id}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                        <Avatar id={p.id} name={p.name} size="sm" />
                        <b>{p.name}</b>
                      </div>
                    </td>
                    <td className="r mono">
                      <Fig
                        amount={c.spend}
                        drill={{
                          title: `${p.name} · Ad Spend`,
                          lines: [{ ref: "Sim. feed", label: p.name, detail: SIM_FEED_NOTE, amount: c.spend }],
                          total: c.spend,
                        }}
                      />
                    </td>
                    <td className="r mono">
                      <Fig
                        amount={c.bookedRev}
                        drill={{
                          title: `${p.name} · Booked Orders`,
                          lines: ords.map((o) => ({
                            ref: `#${o.id}`,
                            label: `${o.customer} (${o.stage})`,
                            amount: orderValue(o),
                          })),
                          total: c.bookedRev,
                        }}
                      />
                    </td>
                    <td className="r mono muted">{c.spend ? L.perNaira(c.bookedRoas) : "—"}</td>
                    <td className="r mono">
                      <Fig
                        amount={c.deliveredRev}
                        drill={{
                          title: `${p.name} · Delivered Orders`,
                          lines: del.map((o) => ({
                            ref: `#${o.id}`,
                            label: o.customer,
                            amount: orderValue(o),
                          })),
                          total: c.deliveredRev,
                        }}
                      />
                    </td>
                    <td className={"r mono " + (c.spend && c.deliveredRoas < 2 ? "neg" : "pos")} style={{ fontWeight: 600 }}>
                      {c.spend ? L.perNaira(c.deliveredRoas) : "—"}
                    </td>
                    <td className={"r mono " + (c.netMargin < 0 ? "neg" : "pos")} style={{ fontWeight: 600 }}>
                      <Fig amount={c.netMargin} sign drill={c.marginDrill} />
                    </td>
                    <td className="r mono">
                      <Fig
                        amount={slip.payable}
                        drill={{
                          title: `${p.name} · Payslip`,
                          lines: slip.lines.map((l) => ({
                            ref: l.orderId ? `#${l.orderId}` : l.kind,
                            label: l.note,
                            amount: l.amount,
                          })),
                          total: slip.gross,
                        }}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

export function LeadView() {
  const data = useData();
  const open = openCycle(data);
  const lines = openLines(data);
  const ps = payslip(lines, "ngozi");

  const teamDelivered = data.orders.filter((o) => o.deliveredCycle === open.id && o.stage === "delivered");
  const teamDelVal = sum(teamDelivered.map(orderValue));
  const splitOrders = data.orders.filter((o) => o.openedBy !== o.closer);

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
        <Tile label={L.teamBonus} note="After any pay taken back">
          <Fig amount={ps.commission + ps.adjustments} drill={payslipDrill} />
        </Tile>
        <Tile label="Team delivered volume" note={`${teamDelivered.length} orders delivered in ${open.id}`}>
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
          label="Split-credit orders"
          note={`Rule: ${data.rules.split === "first" ? "First touch" : data.rules.split === "last" ? "Last touch" : "50-50 split"}`}
        >
          <span className="num">{splitOrders.length}</span>
        </Tile>
      </dl>

      <CloserScorecard />
    </div>
  );
}
