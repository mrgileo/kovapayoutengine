"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { leaks, needsAttention, openCycle } from "@/lib/engine";
import { buildSeed } from "@/lib/seed";
import { useStore } from "@/lib/store";
import type { DemoState } from "@/lib/types";

interface Step {
  title: string;
  /** Runs when the step opens (and again on Back). Every change is guarded, so repeating it is harmless. */
  run: () => void;
  text: (d: DemoState) => string;
  /** The part of the page to light up. */
  target: string;
}

const st = () => useStore.getState();
const stage = (id: number) => st().data.orders.find((o) => o.id === id)?.stage;
const naira = (n: number) => "₦" + Math.round(n).toLocaleString();

const STEPS: Step[] = [
  {
    title: "The sales report says one thing",
    run: () => st().setRole("founder"),
    target: ".headline",
    text: () =>
      "Founder view. Commission looks fine as a share of sales, yet after product cost, ads, salaries and courier fees the week is a loss. Click any figure to see the orders behind it.",
  },
  {
    title: "One delivery, everyone sees it",
    run: () => {
      st().setRole("stock");
      if (stage(1043) === "dispatched") st().act(1043, "deliver");
      st().setRole("closer");
    },
    target: ".activity",
    text: () =>
      "Dayo in the warehouse just confirmed order #1043 delivered. You are now Amaka, the closer: her pay moved the moment it landed. The founder saw revenue move and the stock dropped, from one action.",
  },
  {
    title: "Pay on booking, and see what it costs",
    run: () => {
      st().setRole("founder");
      st().setRule("creditOn", "lead");
    },
    target: "#tour-rules",
    text: (d) => {
      const early = leaks(d).find((l) => l.key === "payEarly")?.amount ?? 0;
      return `Pay staff when is now Order booked, so staff are paid before anything is delivered. Commission going out on undelivered orders: ${naira(early)} this week. Switch it back to Delivered and it drops to ₦0.`;
    },
  },
  {
    title: "A return after pay was sent",
    run: () => {
      st().setRole("founder");
      st().setRule("creditOn", "delivered");
      st().setRule("onReturn", "clawback");
      if (stage(1033) === "delivered") st().act(1033, "return", { condition: "resellable" });
    },
    target: ".activity",
    text: () =>
      "Order #1033 was delivered and paid last week, then came back. Amaka's pay for it is taken back from this week's payout. Under Take back next week it would land on the next payout; under Business absorbs she would keep it.",
  },
  {
    title: "Stock-outs raise purchase orders",
    run: () => {
      st().setRole("stock");
      for (const r of needsAttention(st().data)) st().raisePO(r.product.sku, r.suggested);
    },
    target: ".alert",
    text: () =>
      "Three products were at or below their reorder point. Purchase orders are raised in one click and the alert clears. When the stock arrives, orders that were waiting on it, like #1051, unblock.",
  },
  {
    title: "Approve, pay, lock: two people",
    run: () => {
      st().setRole("founder");
      const cy = openCycle(st().data);
      if (cy.status === "open") st().closeCycle();
      st().setRole("accountant");
    },
    target: "#tour-payout",
    text: () =>
      "The founder approved the week. You are now Bisi, the accountant: export the bank file, mark it paid, then lock it. The person who approves pay never pays it, and every step is in the audit log.",
  },
];

/** The guided tour: each step changes the live demo the way a person would, then points at the result. */
export function Tour() {
  const open = useStore((s) => s.guideOpen);
  const setGuide = useStore((s) => s.setGuide);
  const data = useStore((s) => s.data);
  const dataSource = useStore((s) => s.dataSource);
  const [i, setI] = useState(0);
  const lit = useRef<Element | null>(null);

  // Starting the tour puts the demo company back to its first state, so every run tells the same story.
  useEffect(() => {
    if (!open) return;
    if (dataSource !== "demo") {
      st().toast("warn", "The tour uses the demo company. Go back to demo data to take it.");
      setGuide(false);
      return;
    }
    useStore.setState({ data: buildSeed(), importSummary: null, drill: null, returnFor: null, newOrderOpen: false, role: "founder" });
    // Only on opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    STEPS[i].run();
    document.documentElement.setAttribute("data-tour", "");
    let tries = 0;
    let timer: ReturnType<typeof setTimeout>;
    const light = () => {
      const el = document.querySelector(STEPS[i].target);
      if (!el) {
        if (tries++ < 20) timer = setTimeout(light, 100);
        return;
      }
      lit.current?.classList.remove("tour-hl");
      el.classList.add("tour-hl");
      lit.current = el;
      const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      el.scrollIntoView({ behavior: calm ? "auto" : "smooth", block: "center" });
    };
    timer = setTimeout(light, 250);
    return () => {
      clearTimeout(timer);
      lit.current?.classList.remove("tour-hl");
      lit.current = null;
    };
  }, [open, i]);

  useEffect(() => {
    if (open) return;
    document.documentElement.removeAttribute("data-tour");
    setI(0);
  }, [open]);

  if (!open) return null;
  const step = STEPS[i];
  const last = i === STEPS.length - 1;

  return (
    <div className="tour" role="region" aria-label="Guided tour">
      <div className="tour-top">
        <span className="tour-count">
          Step {i + 1} of {STEPS.length}
        </span>
        <button type="button" className="btn xs ghost" onClick={() => setGuide(false)} aria-label="Exit the tour">
          <X size={13} /> Exit
        </button>
      </div>
      <h3>{step.title}</h3>
      <p aria-live="polite">{step.text(data)}</p>
      <div className="tour-nav">
        <button type="button" className="btn sm" disabled={i === 0} onClick={() => setI(i - 1)}>
          <ChevronLeft size={14} /> Back
        </button>
        <span className="tour-dots" aria-hidden="true">
          {STEPS.map((_, n) => (
            <i key={n} className={n === i ? "on" : ""} />
          ))}
        </span>
        <button type="button" className="btn sm primary" onClick={() => (last ? setGuide(false) : setI(i + 1))}>
          {last ? "Finish" : "Next"} {!last && <ChevronRight size={14} />}
        </button>
      </div>
    </div>
  );
}
