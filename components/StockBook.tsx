"use client";

import { PackagePlus, CheckCircle, AlertTriangle } from "lucide-react";
import { STOCK_LABEL, needsAttention, personOf, skuEconomics, stockRows, sum } from "@/lib/engine";
import { dateTime, pct, shortDate, shortName } from "@/lib/format";
import { useData, useStore } from "@/lib/store";
import { Card, Fig, Tile, useMoney } from "./ui";

const TONE_MAP = {
  out: "neg",
  reorder: "warn",
  inbound: "info",
  watch: "warn",
  ok: "pos",
} as const;

export function StockBook() {
  const data = useData();
  const role = useStore((s) => s.role);
  const raisePO = useStore((s) => s.raisePO);
  const receivePO = useStore((s) => s.receivePO);
  const m = useMoney();

  const rows = stockRows(data);
  const skuEcon = skuEconomics(data);
  const alerts = needsAttention(data);
  const canManage = role === "stock" || role === "founder";

  const totalOnHandValue = sum(rows.map((r) => r.onHand * r.product.cost));
  const totalCommitted = sum(rows.map((r) => r.committed));
  const openPOs = data.pos.filter((p) => p.status === "open");
  const openPOValue = sum(openPOs.map((p) => p.qty * p.unitCost));
  const restockedUnits = sum(
    data.orders
      .filter((o) => o.stage === "returned" && o.returnCondition !== "damaged")
      .map((o) => o.qty),
  );

  return (
    <div className="stack">
      {role === "stock" && (
        <dl className="tiles">
          <Tile
            label="SKUs needing reorder"
            note={alerts.length ? alerts.map((a) => a.product.sku).join(", ") : "Every SKU covered by shelf or open PO"}
            tone={alerts.length ? "neg" : "pos"}
          >
            <span className="num">{alerts.length}</span>
          </Tile>
          <Tile label="Units committed" note="Reserved for confirmed & dispatched orders">
            <span className="num">{totalCommitted}</span>
          </Tile>
          <Tile label="Stock on hand (at cost)" note="Warehouse inventory valuation">
            <Fig
              amount={totalOnHandValue}
              drill={{
                title: "Warehouse Inventory Valuation (At Cost)",
                lines: rows.map((r) => ({
                  ref: r.product.sku,
                  label: `${r.product.name} · ${r.onHand} units on shelf`,
                  detail: `${m(r.product.cost)} unit cost`,
                  amount: r.onHand * r.product.cost,
                })),
                total: totalOnHandValue,
              }}
            />
          </Tile>
          <Tile
            label="Open POs inbound"
            note={openPOs.length ? `${openPOs.length} POs in transit` : "Raise a PO below to replenish"}
            tone={openPOs.length ? "pos" : undefined}
          >
            <Fig
              amount={openPOValue}
              drill={{
                title: "Open Purchase Orders Inbound",
                lines: openPOs.map((p) => ({
                  ref: p.id,
                  label: `${p.sku} ×${p.qty} · due ${shortDate(p.eta)}`,
                  detail: `Raised by ${shortName(personOf(data, p.raisedBy).name)}`,
                  amount: p.qty * p.unitCost,
                })),
                total: openPOValue,
              }}
            />
          </Tile>
          <Tile label="Restocked from returns" note="Resellable units back on shelf">
            <span className="num">{restockedUnits}</span>
          </Tile>
        </dl>
      )}

      {/* Actionable alert banner */}
      {alerts.length > 0 ? (
        <div className="alert crit">
          <AlertTriangle size={16} />
          <span>
            <b>Stock alert:</b> {alerts.length} SKU{alerts.length === 1 ? "" : "s"} at or below reorder point (
            {alerts.map((r) => `${r.product.sku}: ${r.available} avail`).join(", ")}). Raise a purchase order to replenish and clear the alert.
          </span>
          {canManage && (
            <button
              type="button"
              className="btn sm primary"
              style={{ marginLeft: "auto" }}
              onClick={() => alerts.forEach((a) => raisePO(a.product.sku, a.suggested))}
            >
              <PackagePlus size={14} /> Raise POs for all ({alerts.length})
            </button>
          )}
        </div>
      ) : (
        <div className="alert ok">
          <CheckCircle size={16} />
          <span>
            <b>Stock loop closed:</b> Every SKU is above its reorder point (counting units on shelf + inbound POs).
          </span>
        </div>
      )}

      <Card
        title="Warehouse Stock Book & Replenishment"
        sub="Available = On hand minus Committed to confirmed/dispatched orders. Raising a PO moves units to 'On order' with supplier lead times and clears reorder alerts."
        flush
      >
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Product</th>
                <th className="r">On hand</th>
                <th className="r">Committed</th>
                <th className="r">Available</th>
                <th className="r">On order</th>
                <th className="r">Projected</th>
                <th className="r">Reorder at</th>
                <th>Status</th>
                <th className="r">Value at cost</th>
                <th className="r">Replenish</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const p = r.product;
                const openSkuPOs = data.pos.filter((po) => po.sku === p.sku && po.status === "open");
                return (
                  <tr key={p.sku}>
                    <td className="sku">{p.sku}</td>
                    <td>
                      <b>{p.name}</b>
                      <span className="sub">Lead time: {p.leadDays}d · Unit cost {m(p.cost)}</span>
                    </td>
                    <td className="r mono">{r.onHand}</td>
                    <td className="r mono">{r.committed}</td>
                    <td className={"r mono " + (r.available <= 0 ? "neg" : "")} style={{ fontWeight: 600 }}>
                      {r.available}
                    </td>
                    <td className="r mono">
                      {r.onOrder > 0 ? (
                        <span className="pos">
                          +{r.onOrder} <span className="sub">ETA {shortDate(r.nextEta!)}</span>
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="r mono" style={{ fontWeight: 600 }}>
                      {r.projected}
                    </td>
                    <td className="r mono muted">{p.reorder}</td>
                    <td>
                      <span className={`pill ${TONE_MAP[r.status]}`}>{STOCK_LABEL[r.status]}</span>
                    </td>
                    <td className="r mono">
                      <Fig
                        amount={r.onHand * p.cost}
                        drill={{
                          title: `${p.sku} · ${p.name}`,
                          lines: [
                            {
                              ref: p.sku,
                              label: `${r.onHand} units on hand × ${m(p.cost)}`,
                              amount: r.onHand * p.cost,
                            },
                          ],
                          total: r.onHand * p.cost,
                        }}
                      />
                    </td>
                    <td className="r">
                      {canManage ? (
                        <div className="acts">
                          <button
                            type="button"
                            className={"btn xs " + (r.status === "out" || r.status === "reorder" ? "primary" : "")}
                            onClick={() => raisePO(p.sku, r.suggested)}
                          >
                            <PackagePlus size={12} /> Raise PO (+{r.suggested})
                          </button>
                          {openSkuPOs.map((po) => (
                            <button
                              key={po.id}
                              type="button"
                              className="btn xs"
                              onClick={() => receivePO(po.id)}
                              title={`Receive ${po.id} (${po.qty} units) into warehouse stock`}
                            >
                              Receive {po.id}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <span className="muted" style={{ fontSize: 12 }}>
                          Inventory role only
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {data.pos.length > 0 && (
        <Card title="Purchase Order Register" sub="Raised POs with supplier lead times and receiving status." flush>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>PO #</th>
                  <th>SKU</th>
                  <th className="r">Qty</th>
                  <th className="r">Committed cost</th>
                  <th>Raised</th>
                  <th>ETA</th>
                  <th>Status</th>
                  <th className="r">Action</th>
                </tr>
              </thead>
              <tbody>
                {data.pos.map((po) => (
                  <tr key={po.id}>
                    <td className="mono">{po.id}</td>
                    <td className="sku">{po.sku}</td>
                    <td className="r mono">{po.qty}</td>
                    <td className="r mono">{m(po.qty * po.unitCost)}</td>
                    <td>
                      {shortName(personOf(data, po.raisedBy).name)} · {dateTime(po.raisedAt)}
                    </td>
                    <td className="mono">{shortDate(po.eta)}</td>
                    <td>
                      <span className={`pill ${po.status === "received" ? "pos" : "info"}`}>
                        {po.status === "received" ? "Received" : "In transit"}
                      </span>
                    </td>
                    <td className="r">
                      {po.status === "open" && canManage ? (
                        <button type="button" className="btn xs primary" onClick={() => receivePO(po.id)}>
                          Receive stock
                        </button>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card
        title="SKU Unit Economics & Return Bleed"
        sub="Which products actually make money after product cost, delivery fees, damaged stock and sales pay?"
        flush
      >
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Product</th>
                <th className="r">Landed qty</th>
                <th className="r">Return rate</th>
                <th className="r">Delivered rev.</th>
                <th className="r">Product cost</th>
                <th className="r">Delivery fees &amp; damaged stock</th>
                <th className="r">Sales pay</th>
                <th className="r">Net SKU profit</th>
              </tr>
            </thead>
            <tbody>
              {skuEcon.map((e) => (
                <tr key={e.sku}>
                  <td className="sku">{e.sku}</td>
                  <td>
                    <b>{e.name}</b>
                  </td>
                  <td className="r mono">{e.deliveredQty}</td>
                  <td className={"r mono " + (e.returnRate > 0.25 ? "neg" : "pos")}>
                    {pct(e.returnRate, 0)}
                  </td>
                  <td className="r mono">{m(e.revenue)}</td>
                  <td className="r mono muted">{e.cogs ? "−" + m(e.cogs) : "—"}</td>
                  <td className="r mono muted">
                    {e.courierCost + e.damagedLoss ? "−" + m(e.courierCost + e.damagedLoss) : "—"}
                  </td>
                  <td className="r mono muted">{e.commission ? "−" + m(e.commission) : "—"}</td>
                  <td className={"r mono " + (e.netProfit < 0 ? "neg" : "pos")} style={{ fontWeight: 600 }}>
                    <Fig amount={e.netProfit} sign drill={e.drill} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

