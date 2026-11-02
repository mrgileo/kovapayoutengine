"use client";

import { AlertTriangle, ArrowDown, CheckCircle2 } from "lucide-react";
import { leadFunnel, leaks, revenueFlow, type FlowKey, type Leak } from "@/lib/engine";
import { L } from "@/lib/labels";
import { useData } from "@/lib/store";
import { Card, Fig, useMoney } from "./ui";

const STEP_INDEX: Record<FlowKey, number> = { booked: 1, confirmed: 2, dispatched: 3, delivered: 4, kept: 5, cash: 6 };
const pctText = (n: number) => `${Math.round(n * 100)}%`;

/** Every order booked this week and where it has got to, with the money at each step. */
export function FlowFunnel() {
  const data = useData();
  const m = useMoney();
  const flow = revenueFlow(data);
  const booked = flow.steps[0];
  const lf = leadFunnel(data);

  return (
    <Card
      title={`Order Breakdown · ${flow.cycleId}`}
      tone="yellow"
      sub={`${L.flowIntro} Click any figure to see the orders.`}
      flush
    >
      {booked.orders === 0 ? (
        <p style={{ padding: "16px 20px", margin: 0 }} className="muted">
          No orders booked in {flow.cycleId} yet.
        </p>
      ) : (
        <div className="flow" role="list">
          {lf.leads > 0 && (
            <div className="flow-leads" id="lead-funnel" style={{ padding: "4px 0 12px", fontSize: 13 }}>
              <div>
                <b>{L.leadsLine(lf.leads, lf.booked, lf.rate)}</b> {lf.open > 0 && <span className="muted">{lf.open} not reached yet. </span>}
                {lf.lost > 0 && (
                  <span>
                    <ArrowDown size={11} aria-hidden="true" /> {lf.lost} never became orders, worth about <Fig amount={lf.lostValue} drill={lf.drill} />
                  </span>
                )}
              </div>
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                {lf.bySource.map((r) => `${L.leadSource[r.source]}: ${r.booked} of ${r.leads}`).join(" · ")}
              </div>
            </div>
          )}
          {flow.steps.map((st) => {
            const label = L.flowStepLabel[st.key];
            const summary = `${label}: ${m(st.value)}. ${L.flowRowSub(st.key, st.orders, booked.orders)}, ${pctText(st.share)} of the value booked`;
            return (
              <div key={st.key} role="listitem">
                {st.drops.length > 0 && (
                  <div className="flow-drops">
                    {st.drops.map((d) => (
                      <span key={d.label} className="flow-drop">
                        <ArrowDown size={11} aria-hidden="true" /> {d.orders} order{d.orders === 1 ? "" : "s"} ({m(d.value)}) stopped here: {d.label}
                      </span>
                    ))}
                  </div>
                )}
                <div className="flow-row" title={summary} tabIndex={0} aria-label={summary}>
                  <div className="flow-lbl">
                    <span>{label}</span>
                    <small>
                      {L.flowRowSub(st.key, st.orders, booked.orders)} · {pctText(st.share)} of sales
                    </small>
                  </div>
                  <div className="flow-track">
                    <div className="flow-bar" style={{ width: `${st.value > 0 ? Math.max(0.8, st.share * 100) : 0}%`, background: `var(--flow-${STEP_INDEX[st.key]})` }} />
                  </div>
                  <div className="flow-amt">
                    <Fig amount={st.value} drill={st.drill} />
                  </div>
                </div>
              </div>
            );
          })}

          <p className="flow-foot">
            {flow.otherWeeksRevenue === 0 ? (
              <>
                <CheckCircle2 size={12} aria-hidden="true" /> “Delivered and kept” equals the delivered revenue in your profit figures.
              </>
            ) : (
              <>
                Your profit figures count {m(flow.otherWeeksRevenue)} more delivered revenue than “Delivered and kept”, from orders booked in earlier weeks.
              </>
            )}
          </p>

          <details className="flow-table">
            <summary>Show as a table</summary>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Step</th>
                  <th className="r">Orders that got this far</th>
                  <th className="r">Value</th>
                  <th className="r">% of booked sales</th>
                </tr>
              </thead>
              <tbody>
                {flow.steps.map((st) => (
                  <tr key={st.key}>
                    <td>{L.flowStepLabel[st.key]}</td>
                    <td className="r mono">{st.orders}</td>
                    <td className="r mono">{m(st.value)}</td>
                    <td className="r mono">{pctText(st.share)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </div>
      )}
    </Card>
  );
}

function LeakRow({ leak }: { leak: Leak }) {
  const m = useMoney();
  const text = L.leak[leak.key];
  const clear = leak.amount <= 0;
  return (
    <div className={"leak-row" + (clear ? " clear" : "")}>
      <span className={"leak-ico " + (clear ? "pos" : leak.kind === "stuck" ? "warn" : "neg")} title={clear ? "Clear" : leak.kind === "stuck" ? "Stuck" : "Costing you"}>
        {clear ? <CheckCircle2 size={15} aria-label="Clear" /> : <AlertTriangle size={15} aria-label={leak.kind === "stuck" ? "Stuck" : "Costing you"} />}
      </span>
      <div className="leak-main">
        <b>{text.label}</b>
        <small>{clear ? "Nothing here right now." : text.why}</small>
        {!clear && <small className="leak-do">{text.action}</small>}
      </div>
      <div className="leak-amt">
        {clear ? (
          <span className="muted mono">{m(0)}</span>
        ) : (
          <>
            <Fig amount={leak.amount} drill={leak.drill} />
            <small>
              {leak.count} item{leak.count === 1 ? "" : "s"}
            </small>
          </>
        )}
      </div>
    </div>
  );
}

/** Money that is stuck on its way in, and money that is costing you. */
export function LeaksPanel() {
  const data = useData();
  const m = useMoney();
  const all = leaks(data).filter((l) => l.key !== "cash"); // courier cash is the hero card, so it is not repeated here
  const groups: { kind: Leak["kind"]; title: string; note: string }[] = [
    { kind: "stuck", title: "Stuck on the way in", note: "Money you should get, that hasn't arrived" },
    { kind: "costing", title: "Costing you", note: "Money that has gone out, or is going out, for little" },
  ];
  const open = all.filter((l) => l.amount > 0).length;

  return (
    <Card
      title="Where money is stuck or leaking"
      tone="yellow"
      sub={open === 0 ? "Nothing is stuck or leaking right now." : `${open} of ${all.length} checks need attention. These are different views of the same week, so they are not added together.`}
      flush
    >
      <div className="leaks">
        {groups.map((g) => {
          const rows = all.filter((l) => l.kind === g.kind);
          const subtotal = rows.reduce((a, l) => a + l.amount, 0);
          return (
            <section key={g.kind} aria-label={g.title}>
              <header className="leak-head">
                <div>
                  <b>{g.title}</b>
                  <small>{g.note}</small>
                </div>
                <span className="mono">{m(subtotal)}</span>
              </header>
              {rows.map((l) => (
                <LeakRow key={l.key} leak={l} />
              ))}
            </section>
          );
        })}
      </div>
    </Card>
  );
}
