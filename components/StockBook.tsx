"use client";

import { useMemo, useState } from "react";
import { PackagePlus, CheckCircle, AlertTriangle } from "lucide-react";
import { STOCK_LABEL, needsAttention, personOf, skuEconomics, stockRows, sum } from "@/lib/engine";
import { needsAttentionOf, skuEconomicsOf, stockRowsOf } from "@/lib/derived";
import { dateTime, pct, shortDate, shortName } from "@/lib/format";
import { useData, useStore } from "@/lib/store";
import { askRaisePOs, askReceivePO } from "@/lib/askActions";
import { matchesQuery } from "@/lib/sort";
import { PriceBook } from "./PriceBook";
import { Card, Fig, Tile, useMoney } from "./ui";
import { NoMatches, ScrollTable, SortTh, TableTools, useSortable, type Col } from "./table";

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
  const raisePO = (sku: string, qty: number) => askRaisePOs([{ sku, qty }]);
  const receivePO = askReceivePO;
  const m = useMoney();

  const rows = stockRowsOf(data);
  const skuEcon = skuEconomicsOf(data);

  // Each long table gets its own search and sort.
  const [stockQ, setStockQ] = useState("");
  const [poQ, setPoQ] = useState("");
  const [econQ, setEconQ] = useState("");
  const stockShown = useMemo(() => rows.filter((r) => matchesQuery(stockQ, `${r.product.sku} ${r.product.name} ${STOCK_LABEL[r.status]}`)), [rows, stockQ]);
  const poShown = useMemo(() => data.pos.filter((po) => matchesQuery(poQ, `${po.id} ${po.sku} ${po.status === "received" ? "received" : "in transit"} ${personOf(data, po.raisedBy).name}`)), [data, poQ]);
  const econShown = useMemo(() => skuEcon.filter((e) => matchesQuery(econQ, `${e.sku} ${e.name}`)), [skuEcon, econQ]);
  const stockCols: Col<(typeof rows)[number]>[] = [
    { key: "sku", label: "Code", get: (r) => r.product.sku },
    { key: "name", label: "Product", get: (r) => r.product.name },
    { key: "onHand", label: "On the shelf", get: (r) => r.onHand, align: "r", first: "desc" },
    { key: "committed", label: "Set aside", get: (r) => r.committed, align: "r", first: "desc" },
    { key: "available", label: "Available", get: (r) => r.available, align: "r" },
    { key: "onOrder", label: "On order", get: (r) => r.onOrder, align: "r", first: "desc" },
    { key: "projected", label: "Will have", get: (r) => r.projected, align: "r" },
    { key: "reorder", label: "Reorder level", get: (r) => r.product.reorder, align: "r", first: "desc" },
    { key: "status", label: "Status", get: (r) => STOCK_LABEL[r.status] },
    { key: "worth", label: "Worth (at cost)", get: (r) => r.onHand * r.product.cost, align: "r", first: "desc" },
  ];
  const stockSort = useSortable(stockShown, stockCols);
  const poCols: Col<(typeof data.pos)[number]>[] = [
    { key: "id", label: "Purchase order", get: (po) => po.id, first: "desc" },
    { key: "sku", label: "Code", get: (po) => po.sku },
    { key: "qty", label: "Units", get: (po) => po.qty, align: "r", first: "desc" },
    { key: "cost", label: "Cost", get: (po) => po.qty * po.unitCost, align: "r", first: "desc" },
    { key: "raised", label: "Raised", get: (po) => po.raisedAt, first: "desc" },
    { key: "eta", label: "Arrives", get: (po) => po.eta },
    { key: "status", label: "Status", get: (po) => po.status },
  ];
  const poSort = useSortable(poShown, poCols);
  const econCols: Col<(typeof skuEcon)[number]>[] = [
    { key: "sku", label: "Code", get: (e) => e.sku },
    { key: "name", label: "Product", get: (e) => e.name },
    { key: "units", label: "Delivered units", get: (e) => e.deliveredQty, align: "r", first: "desc" },
    { key: "rate", label: "Return rate", get: (e) => e.returnRate, align: "r", first: "desc" },
    { key: "revenue", label: "Delivered revenue", get: (e) => e.revenue, align: "r", first: "desc" },
    { key: "cogs", label: "Product cost", get: (e) => e.cogs, align: "r", first: "desc" },
    { key: "fees", label: "Delivery fees & damaged stock", get: (e) => e.courierCost + e.damagedLoss, align: "r", first: "desc" },
    { key: "commission", label: "Commission", get: (e) => e.commission, align: "r", first: "desc" },
    { key: "profit", label: "Profit", get: (e) => e.netProfit, align: "r", first: "desc" },
  ];
  const econSort = useSortable(econShown, econCols);
  const alerts = needsAttentionOf(data);
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
            label="Products to reorder"
            note={alerts.length ? `Low or out of stock: ${alerts.map((a) => a.product.sku).join(", ")}` : "Every product has enough stock or an order on the way"}
            tone={alerts.length ? "neg" : "pos"}
          >
            <span className="num">{alerts.length}</span>
          </Tile>
          <Tile label="Units set aside" note="Set aside for orders already confirmed or sent out">
            <span className="num">{totalCommitted}</span>
          </Tile>
          <Tile label="Stock on the shelf (at cost)" note="What it cost us to buy it">
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
            label="Purchase orders on the way"
            note={openPOs.length ? `${openPOs.length} purchase order${openPOs.length === 1 ? "" : "s"} on the way` : "Raise a purchase order below to restock"}
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
          <Tile label="Restocked from returns" note="Returned items put back on the shelf">
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
              onClick={() => askRaisePOs(alerts.map((a) => ({ sku: a.product.sku, qty: a.suggested })))}
            >
              <PackagePlus size={14} /> Order stock for all ({alerts.length})
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
        title="Warehouse stock and reordering"
        sub="Available = on the shelf minus set aside for confirmed or sent-out orders. A purchase order puts units 'On order' and clears the reorder alert."
        actions={rows.length > 5 ? <TableTools query={stockQ} onQuery={setStockQ} sorter={stockSort} label="Search products" placeholder="Search products…" /> : undefined}
        flush
      >
        {stockShown.length === 0 && stockQ.trim() ? <NoMatches query={stockQ} /> : null}
        <ScrollTable rows={9}>
          <table className="tbl">
            <thead>
              <tr>
                {stockCols.map((c) => (
                  <SortTh key={c.key} s={stockSort} col={c.key} />
                ))}
                <th className="r">Restock</th>
              </tr>
            </thead>
            <tbody>
              {stockSort.sorted.map((r) => {
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
                              label: `${r.onHand} units on the shelf × ${m(p.cost)}`,
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
                            <PackagePlus size={12} /> Order more (+{r.suggested})
                          </button>
                          {openSkuPOs.map((po) => (
                            <button
                              key={po.id}
                              type="button"
                              className="btn xs"
                              onClick={() => receivePO(po.id)}
                              title={`Receive ${po.id} (${po.qty} units) into warehouse stock`}
                            >
                              Mark {po.id} received
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
        </ScrollTable>
      </Card>

      {data.pos.length > 0 && (
        <Card
          title="Purchase Order Register"
          sub="Stock you ordered from suppliers: when it arrives and whether it has been received."
          actions={data.pos.length > 5 ? <TableTools query={poQ} onQuery={setPoQ} sorter={poSort} label="Search purchase orders" placeholder="Search orders…" /> : undefined}
          flush
        >
          {poShown.length === 0 && poQ.trim() ? <NoMatches query={poQ} /> : null}
          <ScrollTable rows={8}>
            <table className="tbl">
              <thead>
                <tr>
                  {poCols.map((c) => (
                    <SortTh key={c.key} s={poSort} col={c.key} />
                  ))}
                  <th className="r">Action</th>
                </tr>
              </thead>
              <tbody>
                {poSort.sorted.map((po) => (
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
                          Mark as received
                        </button>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollTable>
        </Card>
      )}

      {/* Prices and profit by product are company accounting: the warehouse does not need them. */}
      {role !== "stock" && <PriceBook />}

      {role !== "stock" && <Card
        title="Profit by product"
        sub="Which products actually make money after product cost, delivery fees, damaged stock and commission?"
        actions={skuEcon.length > 5 ? <TableTools query={econQ} onQuery={setEconQ} sorter={econSort} label="Search products" placeholder="Search products…" /> : undefined}
        flush
      >
        {econShown.length === 0 && econQ.trim() ? <NoMatches query={econQ} /> : null}
        <ScrollTable rows={9}>
          <table className="tbl">
            <thead>
              <tr>
                {econCols.map((c) => (
                  <SortTh key={c.key} s={econSort} col={c.key} />
                ))}
              </tr>
            </thead>
            <tbody>
              {econSort.sorted.map((e) => (
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
        </ScrollTable>
      </Card>}
    </div>
  );
}

