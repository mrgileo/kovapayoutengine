"use client";

import { create } from "zustand";
import { persist, type PersistStorage } from "zustand/middleware";
import type { DemoState, Drill, Role, RuleKey, Rules } from "./types";
import type { Currency } from "./format";
import {
  ActionKey,
  PERSONA,
  canEditRules,
  canRecordCash,
  canSettle,
  actionsFor,
  cloneState,
  closeCycle as closeCycleFx,
  computePnl,
  cycleById,
  firstName,
  lockCycle as lockFx,
  log,
  markPaid as markPaidFx,
  impactOf,
  openCycle,
  openLines,
  payslip,
  raisePO as raisePOFx,
  setProductPrice as setProductPriceFx,
  receivePO as receivePOFx,
  createOrder as createOrderFx,
  salesPeople,
  transition,
} from "./engine";
import { SEED_VERSION, buildSeed } from "./seed";
import { RULE_DEFS, ruleOptionLabel } from "./rules";
import { L } from "./labels";
import type { ImportSummary } from "./importer";
import type { DeepLink } from "./deeplink";

export interface Toast {
  id: number;
  tone: "ok" | "warn" | "err";
  text: string;
}

interface Store {
  data: DemoState;
  role: Role;
  ccy: Currency;
  drill: Drill | null;
  toasts: Toast[];
  returnFor: number | null;
  newOrderOpen: boolean;
  guideOpen: boolean;
  /** Where the numbers come from: the built-in demo, or the user's own CSV files (never uploaded anywhere). */
  dataSource: "demo" | "imported";
  importSummary: ImportSummary | null;
  importOpen: boolean;

  setRole: (r: Role) => void;
  setCcy: (c: Currency) => void;
  openDrill: (d: Drill) => void;
  closeDrill: () => void;
  toast: (tone: Toast["tone"], text: string) => void;
  dismiss: (id: number) => void;
  setReturnFor: (id: number | null) => void;
  setNewOrderOpen: (open: boolean) => void;
  setGuide: (open: boolean) => void;

  setRule: <K extends RuleKey>(key: K, value: Rules[K]) => void;
  setMaxCostPerOrder: (amount: number) => void;
  act: (orderId: number, action: ActionKey, opts?: { condition?: "resellable" | "damaged" }) => void;
  setProductPrice: (sku: string, price: number) => void;
  createOrder: (input: {
    customer: string;
    city: string;
    sku: string;
    qty: number;
    openedBy: string;
    closer: string;
    buyer: string;
  }) => void;
  closeCycle: () => void;
  markPaid: (cycleId: string) => void;
  settleCash: (orderIds: number[]) => void;
  lockCycle: (cycleId: string) => void;
  raisePO: (sku: string, qty: number) => void;
  receivePO: (poId: string) => void;
  reset: () => void;
  setImportOpen: (open: boolean) => void;
  applyImport: (state: DemoState, summary: ImportSummary) => void;
  backToDemo: () => void;
  applyDeepLink: (link: DeepLink) => void;
}

let toastSeq = 0;

/**
 * localStorage, but written once things go quiet instead of on every change (turning a 5,000-order state into JSON takes ~130 ms), flushed when the page is hidden,
 * and loud about a full quota instead of failing silently.
 */
function savedStateStorage(): PersistStorage<unknown> {
  const ls = (() => {
    try {
      return typeof window !== "undefined" && typeof window.localStorage?.getItem === "function" ? window.localStorage : null;
    } catch {
      return null;
    }
  })();
  let pending: { name: string; value: unknown } | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let warned = false;

  const flush = () => {
    clearTimeout(timer);
    if (!pending || !ls) return;
    const { name, value } = pending;
    pending = null;
    try {
      ls.setItem(name, JSON.stringify(value));
      warned = false;
    } catch {
      if (!warned) {
        warned = true;
        useStore.getState().toast("err", "Your browser's storage is full, so your latest changes will not survive a reload. Back to demo data frees the space.");
      }
    }
  };
  if (typeof window !== "undefined") {
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && flush());
  }

  return {
    getItem: (name) => {
      try {
        const raw = ls?.getItem(name);
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    },
    setItem: (name, value) => {
      pending = { name, value };
      clearTimeout(timer);
      timer = setTimeout(flush, 250);
    },
    removeItem: (name) => {
      if (pending?.name === name) pending = null;
      try {
        ls?.removeItem(name);
      } catch {}
    },
  };
}
const now = () => new Date().toISOString();

/** Per-person movement in the open cycle between two states. */
function peopleDeltas(before: DemoState, after: DemoState) {
  const lb = openLines(before);
  const la = openLines(after);
  const out: { label: string; amount: number }[] = [];
  for (const p of salesPeople(after)) {
    const diff = payslip(la, p.id).gross - payslip(lb, p.id).gross;
    if (Math.abs(diff) > 0.5) out.push({ label: p.name.split(" ")[0], amount: diff });
  }
  return out;
}

export const useStore = create<Store>()(
  persist(
    (set, get) => {
      const mutate = (fn: (d: DemoState) => string | void) => {
        const before = get().data;
        const d = cloneState(before);
        const err = fn(d);
        if (typeof err === "string") {
          get().toast("err", err);
          return null;
        }
        set({ data: d });
        return { before, after: d };
      };
      const actor = () => PERSONA[get().role];

      return {
        data: buildSeed(),
        role: "founder",
        ccy: "NGN",
        drill: null,
        toasts: [],
        returnFor: null,
        newOrderOpen: false,
        guideOpen: false,
        dataSource: "demo",
        importSummary: null,
        importOpen: false,

        setRole: (role) => set({ role }),
        setCcy: (ccy) => set({ ccy }),
        openDrill: (drill) => set({ drill }),
        closeDrill: () => set({ drill: null }),
        toast: (tone, text) => {
          const id = ++toastSeq;
          set((s) => ({ toasts: [...s.toasts.slice(-2), { id, tone, text }] }));
          setTimeout(() => get().dismiss(id), tone === "err" ? 6500 : 4200);
        },
        dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
        setReturnFor: (returnFor) => set({ returnFor }),
        setNewOrderOpen: (newOrderOpen) => set({ newOrderOpen }),
        setGuide: (guideOpen) => set({ guideOpen }),

        setProductPrice: (sku, price) => {
          if (!canEditRules(get().role)) {
            get().toast("err", "Only the founder can change prices.");
            return;
          }
          const prev = get().data.products.find((p) => p.sku === sku)?.price;
          const next = Math.round(price);
          if (prev === undefined || next === prev) return;
          const res = mutate((d) => {
            const err = setProductPriceFx(d, sku, next);
            if (err) return err;
            log(d, { at: now(), actor: actor(), kind: "stock", text: `${sku} price: ₦${prev.toLocaleString()} → ₦${next.toLocaleString()} · applies to new orders only` });
          });
          if (res) get().toast("ok", `${sku} is now ₦${next.toLocaleString()}. New orders only.`);
        },
        setMaxCostPerOrder: (amount) => {
          if (!canEditRules(get().role)) {
            get().toast("err", "Only the founder can change the max cost per order.");
            return;
          }
          const next = Math.max(0, Math.round(amount));
          const prev = get().data.maxCostPerOrder;
          if (!Number.isFinite(next) || next === prev) return;
          const res = mutate((d) => {
            d.maxCostPerOrder = next;
            log(d, { at: now(), actor: actor(), kind: "rule", text: `${L.maxCostPerOrder}: ₦${prev.toLocaleString()} → ₦${next.toLocaleString()}. Flag only, pay is unchanged.` });
          });
          if (res) get().toast("ok", `${L.maxCostPerOrder} set to ₦${next.toLocaleString()}.`);
        },

        setRule: (key, value) => {
          if (!canEditRules(get().role)) {
            get().toast("err", "Only the founder can change payout rules.");
            return;
          }
          const prev = get().data.rules[key];
          if (prev === value) return;
          const res = mutate((d) => {
            const pre = cloneState(d);
            const pb = computePnl(d);
            d.rules[key] = value;
            d.rulesMeta[key] = { by: actor(), at: now() };
            const pa = computePnl(d);
            const label = RULE_DEFS.find((r) => r.key === key)!.label;
            log(d, {
              at: now(),
              actor: actor(),
              kind: "rule",
              text: `Rule changed · ${label}: ${ruleOptionLabel(key, prev)} → ${ruleOptionLabel(key, value)}`,
              deltas: [
                { label: "Total staff pay", amount: pa.payout - pb.payout },
                { label: "Real profit", amount: pa.actual - pb.actual },
              ].filter((x) => Math.abs(x.amount) > 0.5),
              impact: impactOf(pre, d),
            });
          });
          if (res) get().toast("ok", `${RULE_DEFS.find((r) => r.key === key)!.label} → ${ruleOptionLabel(key, value)}. Stamped to you.`);
        },

        act: (orderId, action, opts = {}) => {
          const res = mutate((d) => {
            const o = d.orders.find((x) => x.id === orderId)!;
            // Enforced here as well as in the UI: a role can only do what actionsFor allows it on this order.
            if (!actionsFor(get().data, get().role, o).includes(action)) return "You do not have permission to do that on this order.";
            const credited = o.creditedCycle ? cycleById(d, o.creditedCycle) : undefined;
            const err = transition(d, orderId, action, opts);
            if (err) return err;
            const p = o.sku;
            let text = "";
            switch (action) {
              case "confirm":
                text = `Order ${o.id} confirmed · ${o.qty} ${p} reserved`;
                break;
              case "dispatch":
                text = `Order ${o.id} dispatched to ${o.city}`;
                break;
              case "deliver":
                text = `Order ${o.id} delivered · ${p} −${o.qty} on hand`;
                break;
              case "fail":
                text = `Order ${o.id} failed delivery · delivery fee lost, goods back on shelf`;
                break;
              case "cash":
                text = `Courier remitted cash for order ${o.id}`;
                break;
              case "return": {
                const cond = o.returnCondition === "damaged" ? `damaged, written off` : `${p} +${o.qty} restocked`;
                const policy = credited
                  ? credited.status === "locked"
                    ? ` · ${credited.id} locked, commission is final`
                    : ` · commission was paid in ${credited.id} → ${ruleOptionLabel("onReturn", d.rules.onReturn)}`
                  : "";
                text = `Order ${o.id} returned · ${cond}${policy}`;
                break;
              }
              case "cancel":
                text = `Order ${o.id} cancelled`;
                break;
            }
            const before = get().data;
            log(d, { at: now(), actor: actor(), kind: "order", text, deltas: peopleDeltas(before, d), impact: impactOf(before, d) });
          });
          if (!res) return;
          const deltas = peopleDeltas(res.before, res.after);
          const ccy = get().ccy;
          const fmt = (n: number) =>
            (n < 0 ? "−" : "+") + (ccy === "NGN" ? "₦" : ccy === "USD" ? "$" : "£") + Math.round(Math.abs(n) / (ccy === "NGN" ? 1 : ccy === "USD" ? 1500 : 1900)).toLocaleString();
          const summary = deltas.length ? deltas.map((x) => `${x.label} ${fmt(x.amount)}`).join(" · ") : "No payout change";
          get().toast(deltas.some((x) => x.amount < 0) ? "warn" : "ok", `Order ${orderId}: ${summary}`);
        },

        closeCycle: () => {
          if (get().role !== "founder") return;
          const id = openCycle(get().data).id;
          mutate((d) => {
            const at = now();
            closeCycleFx(d, actor(), at);
            const c = cycleById(d, id)!;
            log(d, { at, actor: actor(), cycle: id, kind: "cycle", text: `Closed and approved ${id} · pay figures frozen`, deltas: [{ label: "Approved staff pay", amount: c.pnl!.payout }] });
          });
          get().toast("ok", `${id} approved. ${openCycle(get().data).id} is now open.`);
        },
        settleCash: (orderIds) => {
          if (!canRecordCash(get().role)) {
            get().toast("err", "Only the accountant or the founder can record courier cash.");
            return;
          }
          let total = 0;
          let done = 0;
          const res = mutate((d) => {
            const before = cloneState(d);
            for (const id of orderIds) {
              const o = d.orders.find((x) => x.id === id);
              if (!o || o.stage !== "delivered" || o.cashIn) continue;
              total += o.unitPrice * o.qty;
              done++;
              transition(d, id, "cash");
            }
            if (done === 0) return "Nothing to record: those orders are already settled.";
            log(d, { at: now(), actor: actor(), kind: "order", text: `Courier remitted cash for ${done} order${done === 1 ? "" : "s"} (₦${total.toLocaleString()})`, impact: impactOf(before, d) });
          });
          if (res) get().toast("ok", `Recorded ₦${total.toLocaleString()} from the courier across ${done} order${done === 1 ? "" : "s"}.`);
        },
        markPaid: (cycleId) => {
          if (!canSettle(get().role)) return;
          mutate((d) => {
            markPaidFx(d, cycleId, actor(), now());
            log(d, { at: now(), actor: actor(), cycle: cycleId, kind: "cycle", text: `Marked ${cycleId} paid · bank file exported` });
          });
        },
        lockCycle: (cycleId) => {
          if (!canSettle(get().role)) return;
          mutate((d) => {
            lockFx(d, cycleId, actor(), now());
            log(d, { at: now(), actor: actor(), cycle: cycleId, kind: "cycle", text: `Locked ${cycleId} · return window closed, commission is final` });
          });
          get().toast("ok", `${cycleId} locked. Later returns no longer touch its payouts.`);
        },
        raisePO: (sku, qty) => {
          const role = get().role;
          if (role !== "stock" && role !== "founder") return;
          mutate((d) => {
            raisePOFx(d, sku, qty, actor(), now());
            const po = d.pos[d.pos.length - 1];
            log(d, { at: now(), actor: actor(), kind: "stock", text: `${po.id} raised · ${qty} × ${sku}, due ${po.eta}`, deltas: [{ label: "Committed spend", amount: qty * po.unitCost }] });
          });
          get().toast("ok", `PO raised for ${qty} × ${sku}. Alert cleared, units now on order.`);
        },
        receivePO: (poId) => {
          mutate((d) => {
            const before = structuredClone(d);
            receivePOFx(d, poId, now());
            const po = d.pos.find((x) => x.id === poId)!;
            log(d, { at: now(), actor: actor(), kind: "stock", text: `${po.id} received · ${po.sku} +${po.qty} on hand`, impact: impactOf(before, d) });
          });
        },
        createOrder: (input) => {
          let createdId = 0;
          const res = mutate((d) => {
            const before = structuredClone(d);
            const o = createOrderFx(d, input);
            createdId = o.id;
            const splitNote = o.openedBy !== o.closer ? ` (opened by ${firstName(d, o.openedBy)}, closed by ${firstName(d, o.closer)})` : "";
            log(d, {
              at: now(),
              actor: actor(),
              kind: "order",
              text: `Lead #${o.id} created · ${o.customer} · ${o.sku} ×${o.qty}${splitNote}`,
              deltas: peopleDeltas(before, d),
              impact: impactOf(before, d),
            });
          });
          if (res) {
            get().toast("ok", `Order #${createdId} created in ${openCycle(get().data).id}.`);
          }
        },
        reset: () => {
          set({ data: buildSeed(), dataSource: "demo", importSummary: null, drill: null, returnFor: null, newOrderOpen: false });
          get().toast("ok", "Demo reset to the seed data.");
        },
        applyDeepLink: (link) => {
          const keys = Object.keys(link.rules) as RuleKey[];
          const before = get().role;
          if (keys.length > 0) {
            if (get().dataSource !== "demo") {
              get().toast("warn", "Rule links only apply to the demo data. Your imported data was left alone.");
            } else {
              // A shared link starts from the demo company so it shows what the post showed; each rule goes through the normal founder path (and the audit log).
              set({ data: buildSeed(), importSummary: null, drill: null, returnFor: null, newOrderOpen: false, role: "founder" });
              for (const k of keys) get().setRule(k, link.rules[k] as never);
              set({ role: before });
            }
          }
          if (link.role) set({ role: link.role });
        },
        setImportOpen: (importOpen) => {
          if (importOpen && !canEditRules(get().role)) {
            get().toast("err", "Only the founder can load your own data.");
            return;
          }
          set({ importOpen });
        },
        applyImport: (state, summary) => {
          if (!canEditRules(get().role)) {
            get().toast("err", "Only the founder can load your own data.");
            return;
          }
          set({ data: state, dataSource: "imported", importSummary: summary, importOpen: false, drill: null, returnFor: null, newOrderOpen: false });
          get().toast("ok", `Loaded ${summary.orders} of your orders across ${summary.weeks} week${summary.weeks === 1 ? "" : "s"}. Nothing left this browser.`);
        },
        backToDemo: () => {
          if (!canEditRules(get().role)) {
            get().toast("err", "Only the founder can switch back to the demo data.");
            return;
          }
          set({ data: buildSeed(), dataSource: "demo", importSummary: null, importOpen: false, drill: null, returnFor: null, newOrderOpen: false });
          get().toast("ok", "Back to the demo data.");
        },
      };
    },
    {
      name: "kova-payout-engine",
      version: SEED_VERSION,
      storage: savedStateStorage(),
      partialize: (s) => ({ data: s.data, role: s.role, ccy: s.ccy, dataSource: s.dataSource, importSummary: s.importSummary }),
      migrate: () => ({ data: buildSeed(), role: "founder" as Role, ccy: "NGN" as Currency }),
    },
  ),
);

export const useData = () => useStore((s) => s.data);
export const actorName = (d: DemoState, id: string) => firstName(d, id);

