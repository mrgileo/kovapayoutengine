"use client";

import { campaignStats, openCycle, openLines, orderValue, payslip, personOf, sum } from "@/lib/engine";
import { useData } from "@/lib/store";
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
    subtitle: "Media buyer · Prospecting campaign",
    lines: ps.lines.map((l) => ({
      ref: l.orderId ? `#${l.orderId}` : l.kind.toUpperCase(),
      label: l.kind === "base" ? "Weekly pro-rated base" : `Order #${l.orderId}`,
      detail: l.note,
      amount: l.amount,
    })),
    total: ps.gross,
  };

  return (
    <div className="stack">
      <dl className="tiles">
        <Tile label="Net payout this cycle" note="Base + 1.5% on credited orders" tone="pos">
          <Fig amount={ps.payable} drill={payslipDrill} />
        </Tile>
        <Tile label="Campaign ad spend" note={`Prospecting · ${open.id}`}>
          <Fig
            amount={cs.spend}
            drill={{
              title: `Tobi Ade · ${open.id} Ad Spend`,
              lines: [{ ref: "Meta", label: "Prospecting campaign spend", amount: cs.spend }],
              total: cs.spend,
            }}
          />
        </Tile>
        <Tile
          label="Delivered revenue"
          note={`${delivered.length} of ${myOrders.length} orders landed`}
        >
          <Fig
            amount={cs.deliveredRev}
            drill={{
              title: "Delivered Revenue · Prospecting",
              lines: delivered.map((o) => ({
                ref: `#${o.id}`,
                label: `${o.customer} · ${o.sku} ×${o.qty}`,
                detail: o.cashIn ? "Cash remitted" : "Cash with courier",
                amount: orderValue(o),
              })),
              total: cs.deliveredRev,
            }}
          />
        </Tile>
        <Tile
          label="ROAS on delivery"
          note={`Booked ROAS looks like ${cs.bookedRoas.toFixed(2)}× — until returns & pending hit`}
          tone={cs.deliveredRoas < 2 ? "neg" : "pos"}
        >
          <span className="num">{cs.deliveredRoas.toFixed(2)}×</span>
        </Tile>
        <Tile
          label="Campaign net margin"
          note="After COGS, ad spend, courier legs & commission"
          tone={cs.netMargin < 0 ? "neg" : "pos"}
        >
          <Fig amount={cs.netMargin} sign drill={cs.marginDrill} />
        </Tile>
      </dl>

      <Card
        title="Campaign Economics · Booked ROAS vs True Contribution Margin"
        sub="Ad managers report ROAS on leads booked. Founders pay bills out of net contribution margin after COGS, courier legs, and ad spend."
        flush
      >
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Media buyer</th>
                <th>Campaign</th>
                <th className="r">Ad spend</th>
                <th className="r">Booked vol.</th>
                <th className="r">Booked ROAS</th>
                <th className="r">Delivered rev.</th>
                <th className="r">Delivered ROAS</th>
                <th className="r">Net margin (after COGS)</th>
                <th className="r">Cycle pay</th>
              </tr>
            </thead>
            <tbody>
              {["tobi", "zainab"].map((id) => {
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
                    <td>{c.campaign}</td>
                    <td className="r mono">
                      <Fig
                        amount={c.spend}
                        drill={{
                          title: `${p.name} · Ad Spend`,
                          lines: [{ ref: "Meta", label: p.title, amount: c.spend }],
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
                    <td className="r mono muted">{c.spend ? c.bookedRoas.toFixed(2) + "×" : "—"}</td>
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
                      {c.spend ? c.deliveredRoas.toFixed(2) + "×" : "—"}
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
    subtitle: "1.0% override on credited team volume + weekly pro-rated base",
    lines: ps.lines.map((l) => ({
      ref: l.orderId ? `#${l.orderId}` : l.kind.toUpperCase(),
      label: l.kind === "base" ? "Weekly pro-rated base" : `Order #${l.orderId}`,
      detail: l.note,
      amount: l.amount,
    })),
    total: ps.gross,
  };

  return (
    <div className="stack">
      <dl className="tiles">
        <Tile label="Team lead net payout" note="Weekly base + 1.0% team override" tone="pos">
          <Fig amount={ps.payable} drill={payslipDrill} />
        </Tile>
        <Tile label="Override commission" note="Net of team clawbacks">
          <Fig amount={ps.commission + ps.adjustments} drill={payslipDrill} />
        </Tile>
        <Tile label="Team delivered volume" note={`${teamDelivered.length} orders landed in ${open.id}`}>
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
