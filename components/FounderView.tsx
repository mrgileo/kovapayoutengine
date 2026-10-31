"use client";

import { AlertCircle } from "lucide-react";
import {
  TARGETS,
  absorbedDrill,
  cashWithCourier,
  computePnl,
  deferredDrill,
  needsAttention,
  openCycle,
  paidOnUndelivered,
} from "@/lib/engine";
import { pct } from "@/lib/format";
import { L, PNL_TEXT as P } from "@/lib/labels";
import { useData } from "@/lib/store";
import { AdBudget } from "./AdBudget";
import { FlowFunnel, LeaksPanel } from "./RevenueFlow";
import { CloserScorecard } from "./CloserScorecard";
import { Card, Fig, Tile, useMoney } from "./ui";
import type { PnLKey } from "@/lib/types";

export function FounderView() {
  const data = useData();
  const m = useMoney();
  const pnl = computePnl(data);
  const open = openCycle(data);
  const courierCash = cashWithCourier(data);
  const undelivered = paidOnUndelivered(data);
  const absorbed = absorbedDrill(data);
  const deferred = deferredDrill(data);
  const stockAlerts = needsAttention(data);

  const naiveNet = pnl.revenue - pnl.commission;
  const coreActual = pnl.revenue - pnl.cogs - pnl.commission - pnl.adSpend;
  const targetRatio = TARGETS.payoutRatio[data.rules.payModel];
  const scaleMax = data.rules.payModel === "base_plus" ? 0.65 : 0.25;

  // Waterfall rows
  const maxBar = Math.max(pnl.revenue, Math.abs(pnl.actual), 350000);
  const wfRows: {
    key: PnLKey;
    label: string;
    sub: string;
    amount: number;
    sign: 1 | -1;
    cls: string;
    isTotal?: boolean;
  }[] = [
    { key: "revenue", label: P.revenue.label, sub: P.revenue.sub(open.id), amount: pnl.revenue, sign: 1, cls: "rev" },
    { key: "refunds", label: P.refunds.label, sub: P.refunds.sub, amount: pnl.refunds, sign: -1, cls: "cost" },
    { key: "cogs", label: P.cogs.label, sub: P.cogs.sub, amount: pnl.cogs, sign: -1, cls: "cost" },
    { key: "writeoffs", label: P.writeoffs.label, sub: P.writeoffs.sub, amount: pnl.writeoffs, sign: -1, cls: "cost" },
    { key: "commission", label: P.commission.label, sub: P.commission.sub, amount: pnl.commission, sign: -1, cls: "cost comm" },
    { key: "base", label: P.base.label, sub: P.base.sub, amount: pnl.base, sign: -1, cls: "cost comm" },
    { key: "adSpend", label: P.adSpend.label, sub: P.adSpend.sub, amount: pnl.adSpend, sign: -1, cls: "cost" },
    { key: "logistics", label: P.logistics.label, sub: P.logistics.sub, amount: pnl.logistics, sign: -1, cls: "cost" },
  ];

  return (
    <div className="stack">
      {/* Headline moment: "payout ratio healthy, business underwater" */}
      <section className="headline" aria-label="Executive P&L headline">
        <div>
          <div className="eyebrow">Founder summary · {open.id}</div>
          <h2>
            {L.headline(pct(pnl.commissionRatio))}{" "}
            {pnl.actual < 0 ? "losing " : "netting "}
            <Fig
              amount={pnl.actual}
              sign
              drill={pnl.drills.actual}
              className={pnl.actual < 0 ? "" : "ok"}
            />{" "}
            this cycle.
          </h2>
          <p>
            {L.headlineBody.intro} <b>{L.headlineBody.productCost}</b> (<Fig amount={pnl.cogs} drill={pnl.drills.cogs} />), <b>{L.headlineBody.adSpend}</b> (<Fig amount={pnl.adSpend} drill={pnl.drills.adSpend} />),{" "}
            {pnl.base > 0 && (
              <>
                <b>{L.headlineBody.fixedSalary}</b> (<Fig amount={pnl.base} drill={pnl.drills.base} />),{" "}
              </>
            )}
            and <b>{L.headlineBody.deliveryFees}</b> (<Fig amount={pnl.logistics} drill={pnl.drills.logistics} />), {L.headlineBody.outro}
          </p>
        </div>

        <div className="hl-stats">
          <div className="hl-stat">
            <span>{L.salesReport}</span>
            <b className="ok">
              <Fig
                amount={naiveNet}
                drill={{
                  title: L.salesReport,
                  subtitle: "Sales minus commission. Ignores product cost and ads.",
                  lines: [
                    { ref: "+", label: "Delivered revenue", amount: pnl.revenue },
                    { ref: "−", label: L.salesPay, amount: -pnl.commission },
                  ],
                  total: naiveNet,
                }}
              />
            </b>
            <em>Sales {m(pnl.revenue)} − commission {m(pnl.commission)}</em>
          </div>
          <div className="hl-stat">
            <span>{L.afterProductAndAds}</span>
            <b className={coreActual < 0 ? "bad" : "ok"}>
              <Fig
                amount={coreActual}
                sign
                drill={{
                  title: L.afterProductAndAds,
                  subtitle: "Sales minus product cost, commission and ad spend",
                  lines: [
                    { ref: "+", label: "Delivered revenue", amount: pnl.revenue },
                    { ref: "−", label: L.productCost, amount: -pnl.cogs },
                    { ref: "−", label: L.salesPay, amount: -pnl.commission },
                    { ref: "−", label: L.adSpend, amount: -pnl.adSpend },
                  ],
                  total: coreActual,
                }}
              />
            </b>
            <em>{m(pnl.revenue, { compact: true })} − {m(pnl.cogs, { compact: true })} − {m(pnl.commission, { compact: true })} − {m(pnl.adSpend, { compact: true })}</em>
          </div>
          <div className="hl-stat">
            <span>{L.realProfit}</span>
            <b className={pnl.actual < 0 ? "bad" : "ok"}>
              <Fig amount={pnl.actual} sign drill={pnl.drills.actual} />
            </b>
            <em>After fixed salaries and delivery fees too</em>
          </div>
          <div className="hl-stat">
            <span>{L.payAsPctOfSales}</span>
            <b className={pnl.payoutRatio > targetRatio ? "bad" : "ok"}>{pct(pnl.payoutRatio)}</b>
            <em>
              Commission alone: {pct(pnl.commissionRatio)} (aim for {pct(TARGETS.commissionRatio, 0)} or less)
            </em>
          </div>
        </div>
      </section>

      <div className="grid-2">
        <FlowFunnel />
        <LeaksPanel />
      </div>

      {/* Key founder tiles */}
      <dl className="tiles">
        <Tile label="Delivered revenue" note="Delivered this week">
          <Fig amount={pnl.revenue} drill={pnl.drills.revenue} />
        </Tile>
        <Tile
          label="Cash still with courier"
          note={courierCash.total > 0 ? "Delivered, but the cash isn't in the bank yet" : "All delivered cash received"}
          tone={courierCash.total > 0 ? "warn" : "pos"}
        >
          <Fig amount={courierCash.total} drill={courierCash} />
        </Tile>
        <Tile
          label="Paid on undelivered orders"
          note={undelivered.total > 0 ? "Commission going out before the order arrives" : "No commission going out before delivery"}
          tone={undelivered.total > 0 ? "neg" : "pos"}
        >
          <Fig amount={undelivered.total} drill={undelivered} />
        </Tile>
        <Tile
          label={
            data.rules.onReturn === "offset"
              ? L.payTakenBackNextWeek
              : L.payKeptOnReturns
          }
          note={
            data.rules.onReturn === "offset"
              ? "Comes off next week's payout"
              : absorbed.total > 0
                ? "Staff keep it, the business takes the loss"
                : "Pay taken back protects your margin"
          }
          tone={absorbed.total > 0 ? "neg" : deferred.total < 0 ? "warn" : "pos"}
        >
          {data.rules.onReturn === "offset" ? (
            <Fig amount={Math.abs(deferred.total)} drill={deferred} />
          ) : (
            <Fig amount={absorbed.total} drill={absorbed} />
          )}
        </Tile>
        <Tile
          label="SKUs needing reorder"
          note={stockAlerts.length ? stockAlerts.map((r) => r.product.sku).join(", ") : "Every product has enough stock for open orders"}
          tone={stockAlerts.length ? "warn" : "pos"}
        >
          <span className="num">{stockAlerts.length}</span>
        </Tile>
      </dl>

      <AdBudget />

      <div className="grid-2">
        {/* True P&L Waterfall */}
        <Card
          title={`Where the money went · ${open.id}`}
          sub="Staff pay is two lines: Fixed salary (the weekly share of monthly pay) and Commission paid (earned on delivered orders). Click any row to see what is behind it."
          flush
        >
          <div className="wf">
            {wfRows.map((r) => {
              const w = Math.min(100, (Math.abs(r.amount) / maxBar) * 100);
              return (
                <div className={"wf-row" + (r.amount === 0 ? " dim" : "")} key={r.key}>
                  <div className="lbl">
                    <span>{r.label}</span>
                    <small>{r.sub}</small>
                  </div>
                  <div className="wf-track">
                    <div
                      className={`wf-bar ${r.cls}`}
                      style={{ left: 0, width: `${Math.max(1.5, w)}%` }}
                    />
                  </div>
                  <div className={"amt " + (r.sign < 0 && r.amount > 0 ? "neg" : "")}>
                    <Fig amount={r.sign * r.amount} sign={r.sign < 0 && r.amount > 0} drill={pnl.drills[r.key]} />
                  </div>
                </div>
              );
            })}

            <div className="wf-row is-total">
              <div className="lbl">
                <span>{P.actual.label}</span>
                <small>{P.actual.sub}</small>
              </div>
              <div className="wf-track">
                <div
                  className={"wf-bar total" + (pnl.actual < 0 ? " neg" : "")}
                  style={{ left: 0, width: `${Math.min(100, (Math.abs(pnl.actual) / maxBar) * 100)}%` }}
                />
              </div>
              <div className={"amt " + (pnl.actual < 0 ? "neg" : "pos")}>
                <Fig amount={pnl.actual} sign drill={pnl.drills.actual} />
              </div>
            </div>
          </div>

          {/* Payout Ratio Meter */}
          <div className="meter">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-2)" }}>
                {L.payAsPctOfSales} (fixed salary + commission vs delivered revenue)
              </span>
              <span className="mono" style={{ fontSize: 14, fontWeight: 600 }}>
                {pct(pnl.payoutRatio)} <span className="muted" style={{ fontSize: 11.5 }}>(target &le; {pct(targetRatio, 0)})</span>
              </span>
            </div>
            <div className="meter-track">
              <div
                className="meter-seg"
                style={{
                  width: `${Math.min(100, ((pnl.revenue > 0 ? Math.max(0, pnl.commission) / pnl.revenue : 0) / scaleMax) * 100)}%`,
                  background: "var(--yellow)",
                }}
                title={L.salesPay}
              />
              <div
                className="meter-seg"
                style={{
                  width: `${Math.min(100, ((pnl.revenue > 0 ? pnl.base / pnl.revenue : 0) / scaleMax) * 100)}%`,
                  background: "var(--pos-fill)",
                }}
                title={L.fixedSalary}
              />
              <div
                className="meter-mark"
                style={{ left: `${(targetRatio / scaleMax) * 100}%` }}
                title={`Target ceiling: ${pct(targetRatio, 0)}`}
              />
            </div>
            <div className="meter-scale">
              <span>0%</span>
              <span>{pct(targetRatio, 0)} ceiling</span>
              <span>{pct(scaleMax, 0)}</span>
            </div>
            <div className="legend">
              <span>
                <i style={{ background: "var(--yellow)" }} />
                {L.salesPay} (<Fig amount={pnl.commission} drill={pnl.drills.commission} />)
              </span>
              <span>
                <i style={{ background: "var(--pos-fill)" }} />
                {L.fixedSalary} (<Fig amount={pnl.base} drill={pnl.drills.base} />)
              </span>
            </div>
          </div>
        </Card>

        {/* Closer Quality Scorecard */}
        <CloserScorecard />
      </div>
    </div>
  );
}

