"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { X, AlertTriangle, CheckCircle2, Info, RotateCcw, Search } from "lucide-react";
import {
  DELIVERY_FEE,
  PERSONA,
  RATES,
  canEditRules,
  canSeeFullAudit,
  cycleById,
  orderValue,
  personOf,
  productOf,
  stockRow,
  sum,
} from "@/lib/engine";
import { dateTime, shortName } from "@/lib/format";
import { RULE_DEFS, ruleOptionLabel } from "@/lib/rules";
import { buildDeepLink } from "@/lib/deeplink";
import { buildSeed } from "@/lib/seed";
import { useData, useStore } from "@/lib/store";
import { Avatar, Card, useMoney } from "./ui";
import type { Role } from "@/lib/types";

export function DrillDrawer() {
  const drill = useStore((s) => s.drill);
  const close = useStore((s) => s.closeDrill);
  const m = useMoney();

  useEffect(() => {
    if (!drill) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drill, close]);

  if (!drill) return null;

  return (
    <>
      <div className="scrim" onClick={close} aria-hidden="true" />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={drill.title}>
        <header className="drawer-head">
          <div>
            <div className="eyebrow">Audit Trail Drill-Down</div>
            <h2>{drill.title}</h2>
            {drill.subtitle && <p>{drill.subtitle}</p>}
            <div className={"drawer-total " + (drill.total < 0 ? "neg" : "")}>
              {m(drill.total, { sign: drill.total < 0 })}
            </div>
          </div>
          <button type="button" className="btn ghost sm" onClick={close} aria-label="Close drill-down">
            <X size={18} />
          </button>
        </header>

        <div className="drawer-body">
          {drill.lines.length === 0 ? (
            <div style={{ padding: 24, color: "var(--muted)", fontSize: 13.5 }}>
              No contributing items in this state.
            </div>
          ) : (
            <ul className="dl">
              {drill.lines.map((l, idx) => (
                <li key={idx}>
                  <span className="ref">{l.ref}</span>
                  <div>
                    <div className="lab">{l.label}</div>
                    {l.detail && <div className="det">{l.detail}</div>}
                  </div>
                  <div className={"a " + (l.amount < 0 ? "neg" : "")}>
                    {m(l.amount, { sign: l.amount < 0 })}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <footer className="drawer-foot">
          <span>Every figure is derived live from order &amp; cycle records.</span>
          <span className="mono">{drill.lines.length} line(s)</span>
        </footer>
      </aside>
    </>
  );
}

export function ReturnDialog() {
  const data = useData();
  const orderId = useStore((s) => s.returnFor);
  const close = useStore((s) => s.setReturnFor);
  const act = useStore((s) => s.act);
  const m = useMoney();

  const order = data.orders.find((o) => o.id === orderId);
  const [cond, setCond] = useState<"resellable" | "damaged">("resellable");
  const [sure, setSure] = useState(false);

  // A fresh tick for every order: returning one order never pre-approves the next.
  useEffect(() => setSure(false), [orderId]);

  if (!order) return null;

  const p = productOf(data, order.sku);
  const cogsAtRisk = p.cost * order.qty;
  const creditedCycle = order.creditedCycle ? cycleById(data, order.creditedCycle) : undefined;
  const paidLines = (creditedCycle?.lines ?? []).filter((l) => l.orderId === order.id && l.kind === "commission");
  const paidAmt = sum(paidLines.map((l) => l.amount));

  return (
    <>
      <div className="scrim" onClick={() => close(null)} aria-hidden="true" />
      <div className="dialog" role="dialog" aria-modal="true" aria-label="Process customer return">
        <div>
          <div className="eyebrow">Customer return · Order #{order.id}</div>
          <h2>
            {order.customer} · {order.sku} ×{order.qty}
          </h2>
          <p>
            Delivered in <b>{order.deliveredCycle}</b> ({m(orderValue(order))}). Say what condition it came back in, and see what the{" "}
            <b>{ruleOptionLabel("onReturn", data.rules.onReturn)}</b> rule does to the commission.
          </p>
        </div>

        <div className="choice" role="group" aria-label="Return item condition">
          <button
            type="button"
            aria-pressed={cond === "resellable"}
            onClick={() => setCond("resellable")}
          >
            <b>Resellable · Return to shelf (+{order.qty} {order.sku})</b>
            <span>Goods pass inspection. Restocked into available inventory; only the ₦{DELIVERY_FEE.toLocaleString()} return delivery fee is lost.</span>
          </button>
          <button
            type="button"
            aria-pressed={cond === "damaged"}
            onClick={() => setCond("damaged")}
          >
            <b>Damaged in transit · Write off product cost ({m(cogsAtRisk)})</b>
            <span>Cannot be resold. Stock is not incremented and {m(cogsAtRisk)} is written off as damaged stock.</span>
          </button>
        </div>

        <div className="calc">
          <div>
            <span>Payout cycle status</span>
            <span className="mono">
              {creditedCycle ? `${creditedCycle.id} (${creditedCycle.status.toUpperCase()})` : "This week (not paid yet)"}
            </span>
          </div>
          <div>
            <span>Current rule</span>
            <span className="mono">{ruleOptionLabel("onReturn", data.rules.onReturn)}</span>
          </div>
          <div className="tot">
            <span>What happens to the commission</span>
            <span className="mono">
              {!creditedCycle
                ? data.rules.onReturn === "absorb"
                  ? "Staff keep it (business absorbs)"
                  : "Not yet paid, so it is cancelled"
                : creditedCycle.status === "locked"
                  ? `Kept (${creditedCycle.id} is locked)`
                  : data.rules.onReturn === "clawback"
                    ? `−${m(paidAmt)} taken back this week`
                    : data.rules.onReturn === "offset"
                      ? `−${m(paidAmt)} taken back next week`
                      : `${m(paidAmt)} kept by staff (business absorbs)`}
            </span>
          </div>
        </div>

        <label className="confirm-tick">
          <input type="checkbox" checked={sure} onChange={(e) => setSure(e.target.checked)} />
          <span>This order really came back. This can&apos;t be undone.</span>
        </label>

        <div className="dialog-foot">
          <button type="button" className="btn ghost" onClick={() => close(null)}>
            Cancel
          </button>
          <button
            type="button"
            className="btn danger"
            disabled={!sure}
            onClick={() => {
              act(order.id, "return", { condition: cond });
              close(null);
            }}
          >
            Confirm return ({cond})
          </button>
        </div>
      </div>
    </>
  );
}

export function NewOrderDialog() {
  const data = useData();
  const open = useStore((s) => s.newOrderOpen);
  const close = useStore((s) => s.setNewOrderOpen);
  const createOrder = useStore((s) => s.createOrder);
  const m = useMoney();

  const [customer, setCustomer] = useState("Chioma Nwankwo");
  const [city, setCity] = useState("Lagos");
  const [skuPick, setSku] = useState("AIR-12");
  const [qty, setQty] = useState(1);
  const [openedBy, setOpenedBy] = useState("amaka");
  const [closer, setCloser] = useState("chidi");
  const [buyer, setBuyer] = useState("tobi");

  if (!open) return null;

  // Your own data may not have the demo SKUs or buyers: fall back to the first one that exists.
  const sku = data.products.some((x) => x.sku === skuPick) ? skuPick : data.products[0].sku;
  const p = productOf(data, sku);
  const sr = stockRow(data, p);
  const buyers = data.people.filter((x) => x.role === "buyer");
  const totalList = p.price * qty;
  const r = RATES[data.rules.creditOn];

  return (
    <>
      <div className="scrim" onClick={() => close(false)} aria-hidden="true" />
      <div className="dialog" role="dialog" aria-modal="true" aria-label="Create new customer lead">
        <div>
          <div className="eyebrow">New order</div>
          <h2>Create New Customer Order</h2>
          <p>
            Try an order opened by one person and closed by another, and see whether there is stock for it. Pay staff when is currently{" "}
            <b>{ruleOptionLabel("creditOn", data.rules.creditOn)}</b>.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 600 }}>
            <span>Customer name</span>
            <input
              type="text"
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
              style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid var(--line-strong)", font: "inherit" }}
            />
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 600 }}>
            <span>Delivery city</span>
            <select
              value={city}
              onChange={(e) => setCity(e.target.value)}
              style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid var(--line-strong)", font: "inherit" }}
            >
              {["Lagos", "Abuja", "Port Harcourt", "Ibadan", "Enugu", "Kano"].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 600 }}>
            <span>Product SKU</span>
            <select
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid var(--line-strong)", font: "inherit" }}
            >
              {data.products.map((pr) => (
                <option key={pr.sku} value={pr.sku}>
                  {pr.sku} · {pr.name}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 600 }}>
            <span>Quantity</span>
            <select
              value={qty}
              onChange={(e) => setQty(Number(e.target.value))}
              style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid var(--line-strong)", font: "inherit" }}
            >
              {[1, 2, 3].map((n) => (
                <option key={n} value={n}>
                  {n} unit{n > 1 ? "s" : ""}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 600 }}>
            <span>Opened by (First touch)</span>
            <select
              value={openedBy}
              onChange={(e) => setOpenedBy(e.target.value)}
              style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid var(--line-strong)", font: "inherit" }}
            >
              <option value="amaka">Amaka Obi</option>
              <option value="chidi">Chidi Nwosu</option>
            </select>
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 600 }}>
            <span>Closed by (Last touch)</span>
            <select
              value={closer}
              onChange={(e) => setCloser(e.target.value)}
              style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid var(--line-strong)", font: "inherit" }}
            >
              <option value="amaka">Amaka Obi</option>
              <option value="chidi">Chidi Nwosu</option>
            </select>
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 600, gridColumn: "1 / -1" }}>
            <span>Media buyer</span>
            <select
              value={buyer}
              onChange={(e) => setBuyer(e.target.value)}
              style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid var(--line-strong)", font: "inherit" }}
            >
              {buyers.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="calc">
          <div>
            <span>Order value ({sku} ×{qty})</span>
            <span className="mono">{m(totalList)}</span>
          </div>
          <div>
            <span>Warehouse availability</span>
            <span className={"mono " + (sr.available < qty ? "neg" : "pos")}>
              {sr.available} available {sr.available < qty ? "(cannot be confirmed until stock arrives)" : "(ready to confirm)"}
            </span>
          </div>
          <div className="tot">
            <span>Total commission ({((r.closer + r.buyer + r.lead) * 100).toFixed(2)}%)</span>
            <span className="mono">{m(totalList * (r.closer + r.buyer + r.lead))}</span>
          </div>
        </div>

        <div className="dialog-foot">
          <button type="button" className="btn ghost" onClick={() => close(false)}>
            Cancel
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={() => {
              createOrder({ customer, city, sku, qty, openedBy, closer, buyer });
              close(false);
            }}
          >
            Create lead
          </button>
        </div>
      </div>
    </>
  );
}

export function CommandPalette({
  open,
  onClose,
  onSwitchRole,
  themeChoice = "light",
  onSelectTheme,
}: {
  open: boolean;
  onClose: () => void;
  onSwitchRole: (r: Role) => void;
  themeChoice?: "light" | "dark";
  onSelectTheme?: (choice: "light" | "dark") => void;
}) {
  const data = useData();
  const role = useStore((s) => s.role);
  const setRule = useStore((s) => s.setRule);
  const setNewOrderOpen = useStore((s) => s.setNewOrderOpen);
  const closeCycle = useStore((s) => s.closeCycle);
  const reset = useStore((s) => s.reset);
  const toast = useStore((s) => s.toast);
  const [q, setQ] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (open) onClose();
      } else if (e.key === "Escape" && open) {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const editable = canEditRules(role);
  const roles: Role[] = ["founder", "closer", "buyer", "lead", "accountant", "stock"];

  const items: { label: string; tag: string; run: () => void }[] = [
    ...(onSelectTheme
      ? [
          {
            label: "Theme: Light mode (White + Yellow + Black)",
            tag: themeChoice === "light" ? "Active" : "Theme",
            run: () => {
              onSelectTheme("light");
              onClose();
            },
          },
          {
            label: "Theme: Dark mode (Obsidian Black + Yellow + White)",
            tag: themeChoice === "dark" ? "Active" : "Theme",
            run: () => {
              onSelectTheme("dark");
              onClose();
            },
          },
        ]
      : []),
    ...roles.map((r) => {
      const p = personOf(data, PERSONA[r]);
      return {
        label: `Switch persona → ${p.name} (${p.title})`,
        tag: r === role ? "Active" : "Persona",
        run: () => {
          onSwitchRole(r);
          onClose();
        },
      };
    }),
    {
      label: "Create new customer order / lead",
      tag: "Action",
      run: () => {
        setNewOrderOpen(true);
        onClose();
      },
    },
    ...(editable
      ? [
          ...RULE_DEFS.flatMap((def) =>
            def.options.map((opt) => ({
              label: `Rule: ${def.label} → ${opt.label}`,
              tag: data.rules[def.key] === opt.value ? "Current rule" : "Founder rule",
              run: () => {
                setRule(def.key, opt.value as never);
                onClose();
              },
            })),
          ),
          {
            label: "Close this week and approve the pay",
            tag: "Cycle",
            run: () => {
              closeCycle();
              onClose();
            },
          },
        ]
      : []),
    {
      label: "Copy a link to this view",
      tag: "Share",
      run: () => {
        const url = buildDeepLink(window.location.origin + window.location.pathname, role, data.rules, buildSeed().rules);
        const done = (ok: boolean) => toast(ok ? "ok" : "err", ok ? "Link copied. It opens this persona with these pay rules." : `Couldn't copy. Link: ${url}`);
        (navigator.clipboard?.writeText(url) ?? Promise.reject()).then(() => done(true), () => done(false));
        onClose();
      },
    },
    {
      label: "Reset the demo to its starting data",
      tag: "System",
      run: () => {
        reset();
        onClose();
      },
    },
  ];

  const filtered = items.filter((it) =>
    `${it.label} ${it.tag}`.toLowerCase().includes(q.trim().toLowerCase()),
  );

  return (
    <>
      <div className="scrim" onClick={onClose} aria-hidden="true" />
      <div className="dialog" role="dialog" aria-modal="true" aria-label="Quick command palette">
        <div style={{ display: "flex", alignItems: "center", gap: 9, borderBottom: "1px solid var(--line)", paddingBottom: 10 }}>
          <Search size={15} style={{ color: "var(--yellow)" }} />
          <input
            type="text"
            autoFocus
            placeholder="Jump to a person, change a rule, or run an action…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{
              flex: 1,
              padding: "6px 10px",
              borderRadius: 8,
              font: "inherit",
              fontSize: 13,
            }}
          />
          <button type="button" className="btn xs ghost" onClick={onClose}>
            Esc
          </button>
        </div>

        <ul className="cmd-list">
          {filtered.map((it, idx) => (
            <li key={idx}>
              <button type="button" className="cmd-item" onClick={it.run}>
                <span>{it.label}</span>
                <span className="pill plain">{it.tag}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

export function AuditLogCard() {
  const data = useData();
  const role = useStore((s) => s.role);
  const reset = useStore((s) => s.reset);
  const m = useMoney();
  const full = canSeeFullAudit(role);
  const me = PERSONA[role];
  const entries = full ? data.audit : data.audit.filter((e) => e.actor === me);

  return (
    <Card
      title={full ? "Audit log: who did what" : "Your actions"}
      sub={
        full
          ? "Everything that changes anything: rules, orders, prices, purchase orders and weekly payouts. Each entry shows who did it, when, and what it did to pay and profit."
          : "What you did, and when. For example: Order 1043 confirmed by you."
      }
      actions={
        full ? (
          <button type="button" className="btn sm ghost" onClick={reset}>
            <RotateCcw size={13} /> Reset demo data
          </button>
        ) : undefined
      }
      flush
    >
      {entries.length === 0 && <p className="muted" style={{ padding: "14px 20px", margin: 0, fontSize: 13 }}>Nothing yet. When you take an action, such as confirming an order, it shows up here.</p>}
      <ol className="audit">
        {entries.map((e) => {
          const p = personOf(data, e.actor);
          return (
            <li key={e.id}>
              <Avatar id={p.id} name={p.name} size="sm" />
              <div>
                <div className="txt">{e.text}</div>
                {e.deltas && e.deltas.length > 0 && (
                  <div className="deltas">
                    {e.deltas.map((d, i) => (
                      <span key={i} className={d.amount < 0 ? "neg" : "pos"}>
                        {d.label}: {m(d.amount, { sign: true })}
                      </span>
                    ))}
                  </div>
                )}
                <div className="meta">
                  <span>{shortName(p.name)} ({p.role})</span>
                  <span>·</span>
                  <span>{e.cycle}</span>
                  <span>·</span>
                  <span>{dateTime(e.at)}</span>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

export function ToastTray() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismiss);
  if (!toasts.length) return null;
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.tone}`}>
          {t.tone === "ok" && <CheckCircle2 size={16} style={{ flex: "none", marginTop: 1 }} />}
          {t.tone === "warn" && <AlertTriangle size={16} style={{ flex: "none", marginTop: 1 }} />}
          {t.tone === "err" && <Info size={16} style={{ flex: "none", marginTop: 1 }} />}
          <span>{t.text}</span>
          <button type="button" onClick={() => dismiss(t.id)} aria-label="Dismiss notification">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
