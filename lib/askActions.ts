"use client";
// Builds the "are you sure?" request for each permanent action and hands it to the store. Components call these
// instead of the store actions, so every state-changing click shows its impact and the permanent-action warning.
// The Tour and the guided demo are scripted and keep calling the store directly.
import { NOTE_SPECS, type AskRequest } from "./ask";
import type { DemoState, RuleKey, Rules } from "./types";
import {
  ACTION_LABEL,
  DELIVERY_FEE,
  cycleById,
  openCycle,
  openLines,
  orderValue,
  computePnl,
  productOf,
  raisePO as raisePOFx,
  receivePO as receivePOFx,
  sum,
  transition,
  type ActionKey,
} from "./engine";
import { RULE_DEFS, ruleOptionLabel } from "./rules";
import { L } from "./labels";
import { useStore } from "./store";
import type { ImportSummary } from "./importer";

const naira = (n: number) => `${n < 0 ? "−" : ""}₦${Math.round(Math.abs(n)).toLocaleString()}`;
const st = () => useStore.getState();
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

/** One order action: confirm, send out, deliver, fail, cash received, return, cancel. */
export function askOrder(orderId: number, action: ActionKey) {
  const data = st().data;
  const o = data.orders.find((x) => x.id === orderId);
  if (!o) return;
  const p = productOf(data, o.sku);
  const who = `#${o.id} · ${o.customer} · ${o.sku} ×${o.qty} · ${naira(orderValue(o))}`;
  const condOf = (choice: string | undefined) => (choice === "damaged" ? "damaged" : choice === "resellable" ? "resellable" : undefined);
  const base = {
    eyebrow: ACTION_LABEL[action].replace("…", ""),
    simulate: (d: DemoState, choice: string | undefined) => transition(d, orderId, action, { condition: condOf(choice) }) ?? undefined,
    run: (note: string, choice: string | undefined) => st().act(orderId, action, { note, condition: condOf(choice) }),
  };
  const req: Record<ActionKey, AskRequest> = {
    confirm: { ...base, title: `Confirm order #${o.id}?`, body: `${who}. This reserves ${o.qty} × ${o.sku} for the customer.`, confirmLabel: "Confirm order", tone: "primary" },
    dispatch: { ...base, title: `Send order #${o.id} out?`, body: `${who}. The parcel goes to the courier for delivery to ${o.city}.`, confirmLabel: "Send out", tone: "primary" },
    deliver: { ...base, title: `Mark order #${o.id} delivered?`, body: `${who}. ${o.qty} × ${o.sku} leaves the shelf, and pay is credited if your rule pays on delivery.`, confirmLabel: "Mark delivered", tone: "primary" },
    fail: {
      ...base,
      title: `Record a failed delivery for #${o.id}?`,
      body: `${who}. The ${naira(DELIVERY_FEE)} delivery fee is lost and the goods go back on the shelf.`,
      confirmLabel: "Record failed delivery",
      tone: "danger",
      note: NOTE_SPECS.fail,
    },
    cash: {
      ...base,
      title: `Record the courier's cash for #${o.id}?`,
      body: `${who}. Money that was with the courier is now in your hands.`,
      confirmLabel: "Cash received",
      tone: "primary",
      note: NOTE_SPECS.cash,
    },
    cancel: {
      ...base,
      title: `Cancel order #${o.id}?`,
      body: `${who}. The order is closed and any pay credited on it is reversed under your pay rules.`,
      confirmLabel: "Cancel order",
      tone: "danger",
      note: NOTE_SPECS.cancel,
    },
    return: (() => {
      const credited = o.creditedCycle ? cycleById(data, o.creditedCycle) : undefined;
      const paidAmt = sum((credited?.lines ?? []).filter((l) => l.orderId === o.id && l.kind === "commission").map((l) => l.amount));
      const rule = ruleOptionLabel("onReturn", data.rules.onReturn);
      const effect = !credited
        ? data.rules.onReturn === "absorb"
          ? "Staff keep it (business absorbs)"
          : "Not yet paid, so it is cancelled"
        : credited.status === "locked"
          ? `Kept (${credited.id} is locked)`
          : data.rules.onReturn === "clawback"
            ? `−${naira(paidAmt)} taken back this week`
            : data.rules.onReturn === "offset"
              ? `−${naira(paidAmt)} taken back next week`
              : `${naira(paidAmt)} kept by staff (business absorbs)`;
      return {
        ...base,
        title: `Process the return of #${o.id}?`,
        body: `${who}. Say what condition it came back in; the pay rule decides what happens to the commission.`,
        confirmLabel: "Confirm return",
        tone: "danger" as const,
        note: NOTE_SPECS.return,
        choices: {
          label: "Condition it came back in",
          initial: "resellable",
          options: [
            { value: "resellable", label: `Resellable · back on the shelf (+${o.qty} ${o.sku})`, detail: `Passes inspection and is restocked. Only the ${naira(DELIVERY_FEE)} return delivery fee is lost.` },
            { value: "damaged", label: `Damaged · write off ${naira(p.cost * o.qty)}`, detail: "Cannot be resold. Stock is not added back and the product cost is written off." },
          ],
        },
        lines: [
          { label: "Payout week", value: credited ? `${credited.id} (${credited.status.toUpperCase()})` : "This week (not paid yet)" },
          { label: "Current rule", value: rule },
          { label: "What happens to the commission", value: effect },
        ],
      };
    })(),
  };
  st().ask(req[action]);
}

/** Record courier cash for one or many orders ("record all as received"). */
export function askSettleCash(orderIds: number[]) {
  const data = st().data;
  const ids = new Set(orderIds);
  const todo = data.orders.filter((o) => ids.has(o.id) && o.stage === "delivered" && !o.cashIn);
  if (todo.length === 0) {
    st().toast("err", "Nothing to record: those orders are already settled.");
    return;
  }
  const total = sum(todo.map((o) => orderValue(o)));
  st().ask({
    eyebrow: "Courier cash",
    title: todo.length === 1 ? `Record the courier's cash for #${todo[0].id}?` : `Record cash for ${plural(todo.length, "order")}?`,
    body: `${plural(todo.length, "delivered order")} worth ${naira(total)} will be marked as received from the courier.`,
    confirmLabel: todo.length === 1 ? "Cash received" : `Record ${naira(total)} as received`,
    tone: "primary",
    note: NOTE_SPECS.cash,
    simulate: (d) => {
      for (const o of todo) transition(d, o.id, "cash");
    },
    run: (note) => st().settleCash(orderIds, note),
  });
}

/** Founder approves the week: pay figures freeze and the next week opens. */
export function askCloseCycle() {
  const data = st().data;
  const c = openCycle(data);
  const pnl = computePnl(data);
  st().ask({
    eyebrow: "Approve the week",
    title: `Close and approve ${c.id}?`,
    body: "Everyone's pay for this week is frozen as it stands now, and the next week opens. The accountant then pays it.",
    confirmLabel: "Close and approve",
    tone: "primary",
    lines: [
      { label: "Staff pay being approved", value: naira(pnl.payout) },
      { label: "Real profit this week", value: naira(pnl.actual) },
      { label: "Commission lines", value: openLines(data).filter((l) => l.kind === "commission").length.toLocaleString() },
    ],
    run: () => st().closeCycle(),
  });
}

export function askMarkPaid(cycleId: string) {
  const c = cycleById(st().data, cycleId);
  st().ask({
    eyebrow: "Pay the week",
    title: `Mark ${cycleId} as paid?`,
    body: "Say the bank file has been sent and staff have been paid. After this the week can only be locked.",
    confirmLabel: "Mark as paid",
    tone: "danger",
    lines: c?.pnl ? [{ label: "Staff pay for the week", value: naira(c.pnl.payout) }] : undefined,
    note: NOTE_SPECS.markPaid,
    run: (note) => st().markPaid(cycleId, note),
  });
}

export function askLockCycle(cycleId: string) {
  st().ask({
    eyebrow: "Lock the week",
    title: `Lock ${cycleId}?`,
    body: "The return window closes. Later returns no longer change this week's payouts, and its commission is final.",
    confirmLabel: "Lock the week",
    tone: "danger",
    note: NOTE_SPECS.lockCycle,
    run: (note) => st().lockCycle(cycleId, note),
  });
}

export function askSetRule<K extends RuleKey>(key: K, value: Rules[K]) {
  const data = st().data;
  if (data.rules[key] === value) return;
  const def = RULE_DEFS.find((r) => r.key === key)!;
  st().ask({
    eyebrow: "Pay rule",
    title: `Change "${def.label}"?`,
    body: `${ruleOptionLabel(key, data.rules[key])} → ${ruleOptionLabel(key, value)}. Pay for this week is recalculated straight away.`,
    confirmLabel: "Change the rule",
    tone: "danger",
    simulate: (d) => {
      d.rules[key] = value;
    },
    run: () => st().setRule(key, value),
  });
}

export function askSetPrice(sku: string, price: number) {
  const prev = productOf(st().data, sku).price;
  const next = Math.round(price);
  if (next === prev) return;
  st().ask({
    eyebrow: "Price change",
    title: `Change the price of ${sku}?`,
    body: `${naira(prev)} → ${naira(next)}. It applies to new orders only; existing orders keep the price they were created at.`,
    confirmLabel: "Change the price",
    tone: "danger",
    note: NOTE_SPECS.price,
    run: (note) => st().setProductPrice(sku, next, note),
  });
}

export function askSetMaxCost(amount: number) {
  const prev = st().data.maxCostPerOrder;
  const next = Math.max(0, Math.round(amount));
  if (next === prev) return;
  st().ask({
    eyebrow: "Ad cost limit",
    title: `Change ${L.maxCostPerOrder}?`,
    body: `${naira(prev)} → ${naira(next)}. This only flags buyers who go over it; nobody's pay changes.`,
    confirmLabel: "Change the limit",
    tone: "primary",
    run: () => st().setMaxCostPerOrder(next),
  });
}

export function askRaisePOs(items: { sku: string; qty: number }[]) {
  const data = st().data;
  const cost = sum(items.map((i) => productOf(data, i.sku).cost * i.qty));
  st().ask({
    eyebrow: "Purchase order",
    title: items.length === 1 ? `Order ${items[0].qty} × ${items[0].sku}?` : `Order stock for ${plural(items.length, "SKU")}?`,
    body: `${items.map((i) => `${i.qty} × ${i.sku}`).join(", ")}. About ${naira(cost)} is committed to suppliers.`,
    confirmLabel: items.length === 1 ? "Raise purchase order" : "Raise purchase orders",
    tone: "primary",
    simulate: (d) => {
      for (const i of items) raisePOFx(d, i.sku, i.qty, "sim", new Date().toISOString());
    },
    run: () => items.forEach((i) => st().raisePO(i.sku, i.qty)),
  });
}

export function askReceivePO(poId: string) {
  const po = st().data.pos.find((x) => x.id === poId);
  if (!po) return;
  st().ask({
    eyebrow: "Stock arrives",
    title: `Receive ${poId}?`,
    body: `${po.qty} × ${po.sku} go onto the shelf and become available to promise.`,
    confirmLabel: "Mark received",
    tone: "primary",
    simulate: (d) => receivePOFx(d, poId, new Date().toISOString()),
    run: () => st().receivePO(poId),
  });
}

/** Loading your own files replaces everything on screen. */
export function askImport(state: DemoState, summary: ImportSummary) {
  st().ask({
    eyebrow: "Load your data",
    title: "Replace what is on screen with your files?",
    body: `${summary.orders.toLocaleString()} orders across ${plural(summary.weeks, "week")} replace the current company. Nothing leaves this browser. You can switch back to the demo any time.`,
    confirmLabel: "Show my dashboard",
    tone: "primary",
    run: () => st().applyImport(state, summary),
  });
}
