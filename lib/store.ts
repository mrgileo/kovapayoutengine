"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { DemoState, Drill, Role, RuleKey, Rules } from "./types";
import type { Currency } from "./format";
import {
  ActionKey,
  PERSONA,
  canEditRules,
  closeCycle as closeCycleFx,
  computePnl,
  cycleById,
  discountPenalty,
  firstName,
  lockCycle as lockFx,
  log,
  markPaid as markPaidFx,
  openCycle,
  openLines,
  payslip,
  raisePO as raisePOFx,
  receivePO as receivePOFx,
  createOrder as createOrderFx,
  salesPeople,
  transition,
} from "./engine";
import { SEED_VERSION, buildSeed } from "./seed";
import { RULE_DEFS, ruleOptionLabel } from "./rules";

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
  discountFor: number | null;
  newOrderOpen: boolean;
  guideOpen: boolean;

  setRole: (r: Role) => void;
  setCcy: (c: Currency) => void;
  openDrill: (d: Drill) => void;
  closeDrill: () => void;
  toast: (tone: Toast["tone"], text: string) => void;
  dismiss: (id: number) => void;
  setReturnFor: (id: number | null) => void;
  setDiscountFor: (id: number | null) => void;
  setNewOrderOpen: (open: boolean) => void;
  setGuide: (open: boolean) => void;

  setRule: <K extends RuleKey>(key: K, value: Rules[K]) => void;
  act: (orderId: number, action: ActionKey, opts?: { condition?: "resellable" | "damaged"; discount?: number }) => void;
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
  lockCycle: (cycleId: string) => void;
  raisePO: (sku: string, qty: number) => void;
  receivePO: (poId: string) => void;
  reset: () => void;
}

let toastSeq = 0;
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
        const d = structuredClone(before);
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
        discountFor: null,
        newOrderOpen: false,
        guideOpen: false,

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
        setDiscountFor: (discountFor) => set({ discountFor }),
        setNewOrderOpen: (newOrderOpen) => set({ newOrderOpen }),
        setGuide: (guideOpen) => set({ guideOpen }),

        setRule: (key, value) => {
          if (!canEditRules(get().role)) {
            get().toast("err", "Only the founder can change payout rules.");
            return;
          }
          const prev = get().data.rules[key];
          if (prev === value) return;
          const res = mutate((d) => {
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
                { label: "Total payout", amount: pa.payout - pb.payout },
                { label: "Actual result", amount: pa.actual - pb.actual },
              ].filter((x) => Math.abs(x.amount) > 0.5),
            });
          });
          if (res) get().toast("ok", `${RULE_DEFS.find((r) => r.key === key)!.label} → ${ruleOptionLabel(key, value)}. Stamped to you.`);
        },

        act: (orderId, action, opts = {}) => {
          const res = mutate((d) => {
            const o = d.orders.find((x) => x.id === orderId)!;
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
                text = `Order ${o.id} failed delivery · courier fee lost, goods back on shelf`;
                break;
              case "cash":
                text = `Courier remitted cash for order ${o.id}`;
                break;
              case "return": {
                const cond = o.returnCondition === "damaged" ? `damaged, written off` : `${p} +${o.qty} restocked`;
                const policy = credited
                  ? credited.status === "locked"
                    ? ` · ${credited.id} locked, commission final`
                    : ` · commission was paid in ${credited.id} → ${ruleOptionLabel("onReturn", d.rules.onReturn)}`
                  : "";
                text = `Order ${o.id} returned · ${cond}${policy}`;
                break;
              }
              case "cancel":
                text = `Order ${o.id} cancelled`;
                break;
              case "discount": {
                const pen = discountPenalty(o, d.rules);
                text = o.discount
                  ? `Order ${o.id} discounted ${Math.round(o.discount * 100)}%${pen ? " · past the floor, closer rate halved" : ""}`
                  : `Order ${o.id} discount removed`;
                break;
              }
            }
            const before = get().data;
            log(d, { at: now(), actor: actor(), kind: action === "discount" ? "discount" : "order", text, deltas: peopleDeltas(before, d) });
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
            log(d, { at, actor: actor(), cycle: id, kind: "cycle", text: `Closed and approved ${id} · accruals frozen`, deltas: [{ label: "Approved payout", amount: c.pnl!.payout }] });
          });
          get().toast("ok", `${id} approved. ${openCycle(get().data).id} is now open.`);
        },
        markPaid: (cycleId) => {
          if (get().role !== "founder") return;
          mutate((d) => {
            markPaidFx(d, cycleId, actor(), now());
            log(d, { at: now(), actor: actor(), cycle: cycleId, kind: "cycle", text: `Marked ${cycleId} paid · bank file exported` });
          });
        },
        lockCycle: (cycleId) => {
          if (get().role !== "founder") return;
          mutate((d) => {
            lockFx(d, cycleId, actor(), now());
            log(d, { at: now(), actor: actor(), cycle: cycleId, kind: "cycle", text: `Locked ${cycleId} · return window closed, commission final` });
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
            receivePOFx(d, poId, now());
            const po = d.pos.find((x) => x.id === poId)!;
            log(d, { at: now(), actor: actor(), kind: "stock", text: `${po.id} received · ${po.sku} +${po.qty} on hand` });
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
            });
          });
          if (res) {
            get().toast("ok", `Order #${createdId} created in ${openCycle(get().data).id}.`);
          }
        },
        reset: () => {
          set({ data: buildSeed(), drill: null, returnFor: null, discountFor: null, newOrderOpen: false });
          get().toast("ok", "Demo reset to the seed data.");
        },
      };
    },
    {
      name: "kova-payout-engine",
      version: SEED_VERSION,
      storage: createJSONStorage(() =>
        typeof window !== "undefined" && window.localStorage && typeof window.localStorage.getItem === "function"
          ? window.localStorage
          : { getItem: () => null, setItem: () => {}, removeItem: () => {} },
      ),
      partialize: (s) => ({ data: s.data, role: s.role, ccy: s.ccy }),
      migrate: () => ({ data: buildSeed(), role: "founder" as Role, ccy: "NGN" as Currency }),
    },
  ),
);

export const useData = () => useStore((s) => s.data);
export const actorName = (d: DemoState, id: string) => firstName(d, id);

