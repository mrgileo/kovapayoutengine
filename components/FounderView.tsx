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
import { useData } from "@/lib/store";
import { CloserScorecard } from "./CloserScorecard";
import { Card, Fig, Tile } from "./ui";
import type { PnLKey } from "@/lib/types";

export function FounderView() {
  const data = useData();
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
    { key: "revenue", label: "Delivered revenue", sub: `Orders landed in ${open.id}`, amount: pnl.revenue, sign: 1, cls: "rev" },
    { key: "refunds", label: "− Prior-cycle refunds", sub: "Returned after a closed cycle", amount: pnl.refunds, sign: -1, cls: "cost" },
    { key: "cogs", label: "− Cost of goods (COGS)", sub: "Unit cost of landed stock", amount: pnl.cogs, sign: -1, cls: "cost" },
    { key: "writeoffs", label: "− Damaged write-offs", sub: "Returned unsellable", amount: pnl.writeoffs, sign: -1, cls: "cost" },
    { key: "commission", label: "− Variable commission", sub: "Net of clawbacks", amount: pnl.commission, sign: -1, cls: "cost comm" },
    { key: "base", label: "− Fixed base pay", sub: "Sales staff weekly pro-rata", amount: pnl.base, sign: -1, cls: "cost comm" },
    { key: "adSpend", label: "− Meta ad spend", sub: "Prospecting + Retargeting", amount: pnl.adSpend, sign: -1, cls: "cost" },
    { key: "logistics", label: "− Courier leg fees", sub: "Outbound, failed & return legs", amount: pnl.logistics, sign: -1, cls: "cost" },
  ];

  return (
    <div className="stack">
      {/* Headline moment: "payout ratio healthy, business underwater" */}
      <section className="headline" aria-label="Executive P&L headline">
        <div>
          <div className="eyebrow">Founder Reality Check · {open.id}</div>
          <h2>
            Variable commission is a healthy {pct(pnl.commissionRatio)}, yet the business is{" "}
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
            A naive tracker reports <b>revenue minus commission</b> (<Fig amount={naiveNet} drill={pnl.drills.revenue} />) and calls the week profitable. Once you fold in <b>COGS</b> (<Fig amount={pnl.cogs} drill={pnl.drills.cogs} />), <b>ad spend</b> (<Fig amount={pnl.adSpend} drill={pnl.drills.adSpend} />),{" "}
            {pnl.base > 0 && (
              <>
                <b>pro-rated base</b> (<Fig amount={pnl.base} drill={pnl.drills.base} />),{" "}
              </>
            )}
            and <b>courier legs</b> (<Fig amount={pnl.logistics} drill={pnl.drills.logistics} />), the true operating margin appears. Click any figure to audit the exact orders behind it.
          </p>
        </div>

        <div className="hl-stats">
          <div className="hl-stat">
            <span>Naive &ldquo;Net after commission&rdquo;</span>
            <b className="ok">
              <Fig
                amount={naiveNet}
                drill={{
                  title: "Naive 'Net after commission' (Illusion)",
                  subtitle: "Ignores COGS and ad spend",
                  lines: [
                    { ref: "+", label: "Delivered revenue", amount: pnl.revenue },
                    { ref: "−", label: "Variable commission", amount: -pnl.commission },
                  ],
                  total: naiveNet,
                }}
              />
            </b>
            <em>Reports ₦418,412 while business is losing money</em>
          </div>
          <div className="hl-stat">
            <span>Core actual (Rev − COGS − Comm − Ads)</span>
            <b className={coreActual < 0 ? "bad" : "ok"}>
              <Fig
                amount={coreActual}
                sign
                drill={{
                  title: "Core Actual (Revenue − COGS − Commission − Ad Spend)",
                  subtitle: "The exact 4-line founder reality check",
                  lines: [
                    { ref: "+", label: "Delivered revenue", amount: pnl.revenue },
                    { ref: "−", label: "Cost of goods", amount: -pnl.cogs },
                    { ref: "−", label: "Commission", amount: -pnl.commission },
                    { ref: "−", label: "Ad spend", amount: -pnl.adSpend },
                  ],
                  total: coreActual,
                }}
              />
            </b>
            <em>₦447.5k − ₦222.5k − ₦29.1k − ₦281k</em>
          </div>
          <div className="hl-stat">
            <span>Full operating net (incl. base &amp; courier)</span>
            <b className={pnl.actual < 0 ? "bad" : "ok"}>
              <Fig amount={pnl.actual} sign drill={pnl.drills.actual} />
            </b>
            <em>After weekly base &amp; ₦3,500 courier legs</em>
          </div>
          <div className="hl-stat">
            <span>Total payroll % (Base + Comm)</span>
            <b className={pnl.payoutRatio > targetRatio ? "bad" : "ok"}>{pct(pnl.payoutRatio)}</b>
            <em>
              Commission only: {pct(pnl.commissionRatio)} (target &le; {pct(TARGETS.commissionRatio, 0)})
            </em>
          </div>
        </div>
      </section>

      {/* Key founder tiles */}
      <dl className="tiles">
        <Tile label="Delivered revenue" note="Landed in current cycle">
          <Fig amount={pnl.revenue} drill={pnl.drills.revenue} />
        </Tile>
        <Tile
          label="Cash still with courier"
          note={courierCash.total > 0 ? "Delivered on paper, not in bank" : "All delivered cash remitted"}
          tone={courierCash.total > 0 ? "warn" : "pos"}
        >
          <Fig amount={courierCash.total} drill={courierCash} />
        </Tile>
        <Tile
          label="Paid on undelivered orders"
          note={undelivered.total > 0 ? "Money out before goods land" : "Zero pre-delivery leakage"}
          tone={undelivered.total > 0 ? "neg" : "pos"}
        >
          <Fig amount={undelivered.total} drill={undelivered} />
        </Tile>
        <Tile
          label={
            data.rules.onReturn === "offset"
              ? "Scheduled next-cycle offsets"
              : "Commission kept on returns"
          }
          note={
            data.rules.onReturn === "offset"
              ? "Deducted from next week's payout"
              : absorbed.total > 0
                ? "Absorbed by business on returns"
                : "Clawback protecting margin"
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
          note={stockAlerts.length ? stockAlerts.map((r) => r.product.sku).join(", ") : "Stock ahead of pipeline"}
          tone={stockAlerts.length ? "warn" : "pos"}
        >
          <span className="num">{stockAlerts.length}</span>
        </Tile>
      </dl>

      <div className="grid-2">
        {/* True P&L Waterfall */}
        <Card
          title={`True Operating P&L Waterfall · ${open.id}`}
          sub="Click any row to inspect the exact orders, SKUs, campaigns, or staff lines behind the figure."
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
                <span>= Actual Operating Net</span>
                <small>After COGS, payroll, ads &amp; courier</small>
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
                Total Payroll (Base + Variable) vs Delivered Revenue
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
                title="Variable commission"
              />
              <div
                className="meter-seg"
                style={{
                  width: `${Math.min(100, ((pnl.revenue > 0 ? pnl.base / pnl.revenue : 0) / scaleMax) * 100)}%`,
                  background: "var(--pos-fill)",
                }}
                title="Fixed base pay"
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
                Variable commission (<Fig amount={pnl.commission} drill={pnl.drills.commission} />)
              </span>
              <span>
                <i style={{ background: "var(--pos-fill)" }} />
                Weekly base (<Fig amount={pnl.base} drill={pnl.drills.base} />)
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

