"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { cashGap, leaks, needsAttention, openCycle } from "@/lib/engine";
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
    title: "Earned is not the same as in your hand",
    run: () => st().setRole("founder"),
    target: "#cash-hero",
    text: () =>
      "You are the founder. These three numbers are the gap that hurts most: cash you have earned from delivered orders, cash you have actually received, and the money still sitting with the couriers. Below, the real profit is what you keep after product cost, ads, salaries and courier fees. Click any number to see the orders behind it.",
  },
  {
    title: "One delivery updates everyone",
    run: () => {
      st().setRole("stock");
      if (stage(1043) === "dispatched") st().act(1043, "deliver");
      st().setRole("closer");
    },
    target: ".activity",
    text: () =>
      "Dayo in the warehouse just marked order #1043 as delivered. You are now Amaka, who sold it: her pay went up the moment it was delivered. The founder's revenue went up and the stock went down too, all from that one click.",
  },
  {
    title: "Paying staff too early costs money",
    run: () => {
      st().setRole("founder");
      st().setRule("creditOn", "lead");
    },
    target: "#tour-rules",
    text: (d) => {
      const early = leaks(d).find((l) => l.key === "payEarly")?.amount ?? 0;
      return `The rule "Pay staff when..." is now set to Order booked, so staff get paid before the customer has received anything. That is ${naira(early)} of commission paid out this week on orders not yet delivered. Set it back to Delivered and this falls to ₦0.`;
    },
  },
  {
    title: "An order comes back after staff were paid",
    run: () => {
      st().setRole("founder");
      st().setRule("creditOn", "delivered");
      st().setRule("onReturn", "clawback");
      if (stage(1033) === "delivered") st().act(1033, "return", { condition: "resellable" });
    },
    target: ".activity",
    text: () =>
      "Order #1033 was delivered and Amaka was paid for it last week, then the customer sent it back. Because the rule is Take back now, that pay comes off this week's payout. With Take back next week it would come off the next payout instead, and with Business absorbs she would keep it.",
  },
  {
    title: "Low stock is fixed in one click",
    run: () => {
      st().setRole("stock");
      for (const r of needsAttention(st().data)) st().raisePO(r.product.sku, r.suggested);
    },
    target: ".alert",
    text: () =>
      "Three products have run low, at or below the level where you should reorder. One click orders more from the supplier (a purchase order) and the warning clears. When the stock arrives, orders that were waiting for it, like #1051, can go ahead.",
  },
  {
    title: "Two people handle the money",
    run: () => {
      st().setRole("founder");
      const cy = openCycle(st().data);
      if (cy.status === "open") st().closeCycle();
      st().setRole("accountant");
    },
    target: "#tour-payout",
    text: () =>
      "The founder has approved this week's pay. You are now Bisi, the accountant: download the bank file, mark the week as paid, then lock it so nothing can change. The person who approves the pay is never the one who pays it, and every step is recorded in the audit log.",
  },
];


/** The guided demo: one story, played start to finish. A new order is booked, delivered and paid for. */
const STORY_CUSTOMER = "Chiamaka Eze";
const storyOrder = () => st().data.orders.find((o) => o.customer === STORY_CUSTOMER);

const DEMO_STEPS: Step[] = [
  {
    title: "A normal week",
    run: () => st().setRole("founder"),
    target: "#cash-hero",
    text: (d) => {
      const g = cashGap(d);
      return `You are the founder. This week you have earned ${naira(g.earned)} from delivered orders, but only ${naira(g.received)} has reached you. ${naira(g.gap)} is still with the couriers. Watch what one new order does to these numbers.`;
    },
  },
  {
    title: "A customer says yes",
    run: () => {
      st().setRole("closer");
      if (!storyOrder()) st().createOrder({ customer: STORY_CUSTOMER, city: "Lagos", sku: "BLN-07", qty: 1, openedBy: "amaka", closer: "amaka", buyer: "tobi" });
      const o = storyOrder();
      if (o?.stage === "new") st().act(o.id, "confirm");
    },
    target: ".activity",
    text: () =>
      `You are now Amaka, a closer. She just booked a blender for ${STORY_CUSTOMER} in Lagos and confirmed it. Nothing is paid out yet: she only earns when the order is delivered.`,
  },
  {
    title: "The courier delivers",
    run: () => {
      st().setRole("stock");
      const o = storyOrder();
      if (o?.stage === "confirmed") st().act(o.id, "dispatch");
      const n = storyOrder();
      if (n?.stage === "dispatched") st().act(n.id, "deliver");
      st().setRole("closer");
    },
    target: ".activity",
    text: () =>
      "Dayo in the warehouse sent it out and marked it delivered. That one click raised Amaka's pay, took a blender off the shelf and added to the week's sales.",
  },
  {
    title: "Earned, but not yet in your hand",
    run: () => st().setRole("founder"),
    target: "#cash-hero",
    text: (d) => {
      const g = cashGap(d);
      return `Back as the founder: earned is now ${naira(g.earned)}, but ${naira(g.gap)} is still with the couriers. The sale counts, the cash has not arrived. Click any figure to see the orders behind it.`;
    },
  },
  {
    title: "The courier hands over the cash",
    run: () => {
      st().setRole("accountant");
      const o = storyOrder();
      if (o?.stage === "delivered" && !o.cashIn) st().act(o.id, "cash");
      st().setRole("founder");
    },
    target: "#cash-hero",
    text: (d) => {
      const g = cashGap(d);
      return `Bisi, the accountant, recorded the courier's payment. Received is now ${naira(g.received)}. Every naira is tracked from the order to your bank, and every step is in the audit log. Want this for your own business? Join the waitlist.`;
    },
  },
];

/** The guided tour: each step changes the live demo the way a person would, then points at the result. */
export function Tour() {
  const open = useStore((s) => s.guideOpen);
  const setGuide = useStore((s) => s.setGuide);
  const mode = useStore((s) => s.guideMode);
  const steps = mode === "demo" ? DEMO_STEPS : STEPS;
  const [paused, setPaused] = useState(false);
  const data = useStore((s) => s.data);
  const dataSource = useStore((s) => s.dataSource);
  const [i, setI] = useState(0);
  const lit = useRef<Element | null>(null);
  const spot = useRef<HTMLDivElement>(null);

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
    steps[i].run();
    document.documentElement.setAttribute("data-tour", "");
    let tries = 0;
    let timer: ReturnType<typeof setTimeout>;
    let frame = 0;
    // Keeps the dimming spotlight on the target while it scrolls, resizes or re-renders.
    const follow = (el: Element) => {
      let last = "";
      const tick = () => {
        const s = spot.current;
        if (s) {
          const r = el.getBoundingClientRect();
          const key = `${r.top}|${r.left}|${r.width}|${r.height}`;
          if (key !== last) {
            last = key;
            const pad = 6;
            s.style.top = `${r.top - pad}px`;
            s.style.left = `${r.left - pad}px`;
            s.style.width = `${r.width + pad * 2}px`;
            s.style.height = `${r.height + pad * 2}px`;
          }
          s.style.opacity = "1";
        }
        frame = requestAnimationFrame(tick);
      };
      tick();
    };
    const light = () => {
      const el = document.querySelector(steps[i].target);
      if (!el) {
        if (tries++ < 20) timer = setTimeout(light, 100);
        return;
      }
      lit.current?.classList.remove("tour-hl");
      el.classList.add("tour-hl");
      lit.current = el;
      follow(el);
      const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      el.scrollIntoView({ behavior: calm ? "auto" : "smooth", block: "center" });
    };
    timer = setTimeout(light, 250);
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(frame);
      if (spot.current) spot.current.style.opacity = "0";
      lit.current?.classList.remove("tour-hl");
      lit.current = null;
    };
  }, [open, i, steps]);

  useEffect(() => {
    if (open) return;
    document.documentElement.removeAttribute("data-tour");
    setI(0);
  }, [open]);

  // The guided demo plays itself, one step every few seconds. Pause stops it; reduced-motion users get no autoplay.
  const last = i === steps.length - 1;
  useEffect(() => {
    if (!open || mode !== "demo" || paused || last) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const t = setTimeout(() => setI((n) => n + 1), 8000);
    return () => clearTimeout(t);
  }, [open, mode, paused, last, i]);

  useEffect(() => {
    if (!open) setPaused(false);
  }, [open]);

  if (!open) return null;
  const step = steps[i];

  return (
    <>
    <div ref={spot} className="tour-spot" aria-hidden="true" />
    <div className="tour" role="region" aria-label={mode === "demo" ? "Guided demo" : "Guided tour"}>
      <div className="tour-top">
        <span className="tour-count">
          {mode === "demo" ? "Guided demo" : "Step"} {i + 1} of {steps.length}
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
          {steps.map((_, n) => (
            <i key={n} className={n === i ? "on" : ""} />
          ))}
        </span>
        {mode === "demo" && !last && (
          <button type="button" className="btn sm" onClick={() => setPaused((p) => !p)} aria-pressed={paused}>
            {paused ? "Resume" : "Pause"}
          </button>
        )}
        <button type="button" className="btn sm primary" onClick={() => (last ? setGuide(false) : setI(i + 1))}>
          {last ? "Finish" : "Next"} {!last && <ChevronRight size={14} />}
        </button>
      </div>
    </div>
    </>
  );
}
