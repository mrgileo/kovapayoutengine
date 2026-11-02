"use client";

import { useEffect, useRef, useState } from "react";
import { Activity, ChevronDown, ChevronUp } from "lucide-react";
import { PERSONA, firstName, impactFor, impactIsEmpty } from "@/lib/engine";
import { L } from "@/lib/labels";
import { useData, useStore } from "@/lib/store";
import type { AuditEntry, Impact } from "@/lib/types";
import { useMoney } from "./ui";

const SHOWN = 5;

function ago(iso: string, now: number): string {
  const secs = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (secs < 20) return "just now";
  if (secs < 90) return `${secs}s ago`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

interface Chip {
  key: string;
  text: string;
  /** good = this is better for the thing named; bad = worse. Never colour alone: the text carries a sign. */
  tone: "good" | "bad" | "plain";
  mine?: boolean;
}

/** The chips for one event, restricted to what the viewing role may see. */
function useChips() {
  const data = useData();
  const role = useStore((s) => s.role);
  const m = useMoney();
  const me = PERSONA[role];

  return (entry: AuditEntry): { chips: Chip[]; any: boolean } => {
    if (!entry.impact) return { chips: [], any: false };
    const i: Impact = impactFor(data, entry.impact, role);
    const chips: Chip[] = [];
    for (const p of i.pay) {
      chips.push({ key: "pay-" + p.personId, text: `${p.personId === me ? "You" : firstName(data, p.personId)} ${m(p.amount, { sign: true })}`, tone: p.amount >= 0 ? "good" : "bad", mine: p.personId === me });
    }
    if (i.revenue !== undefined) chips.push({ key: "rev", text: `${L.revenue} ${m(i.revenue, { sign: true })}`, tone: i.revenue >= 0 ? "good" : "bad" });
    if (i.profit !== undefined) chips.push({ key: "profit", text: `${L.realProfit} ${m(i.profit, { sign: true })}`, tone: i.profit >= 0 ? "good" : "bad" });
    if (i.stuckCash !== undefined) chips.push({ key: "stuck", text: `${L.cashWithCourier} ${m(i.stuckCash, { sign: true })}`, tone: i.stuckCash > 0 ? "bad" : "good" });
    for (const s of i.stock) {
      if (s.onHand[0] !== s.onHand[1]) chips.push({ key: "oh-" + s.sku, text: `${s.sku} on the shelf ${s.onHand[0]} → ${s.onHand[1]}`, tone: "plain" });
      if (s.available[0] !== s.available[1]) chips.push({ key: "av-" + s.sku, text: `${s.sku} free ${s.available[0]} → ${s.available[1]}`, tone: s.available[1] < s.available[0] ? "bad" : "good" });
    }
    return { chips, any: !impactIsEmpty(i) };
  };
}

function EventLine({ entry, now, big }: { entry: AuditEntry; now: number; big?: boolean }) {
  const data = useData();
  const chipsFor = useChips();
  const { chips, any } = chipsFor(entry);
  return (
    <div className={"act-event" + (big ? " big" : "")}>
      <span className="act-text">
        <b>{firstName(data, entry.actor)}</b> · {entry.text} <span className="act-ago">{ago(entry.at, now)}</span>
      </span>
      <span className="act-chips">
        {any ? (
          chips.map((c) => (
            <span key={c.key} className={`act-chip ${c.tone}${c.mine ? " mine" : ""}`}>
              {c.text}
            </span>
          ))
        ) : (
          <span className="act-none">Nothing changes for you.</span>
        )}
      </span>
    </div>
  );
}

/** One line: who did what, and the one change that matters most to the person viewing. */
function OneLine({ entry, now }: { entry: AuditEntry; now: number }) {
  const data = useData();
  const chipsFor = useChips();
  const { chips } = chipsFor(entry);
  const chip = chips.find((c) => c.mine) ?? chips[0];
  return (
    <span className="act-one">
      <span className="act-one-text" title={entry.text}>
        <b>{firstName(data, entry.actor)}</b> · {entry.text}
      </span>
      <span className="act-ago">{ago(entry.at, now)}</span>
      {chip && <span className={`act-chip ${chip.tone}${chip.mine ? " mine" : ""}`}>{chip.text}</span>}
    </span>
  );
}

/** A live line on every tab: the latest event on a single row. "Details" opens who and what it moved, and earlier events. */
export function ActivityStrip() {
  const data = useData();
  const role = useStore((s) => s.role);
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [fresh, setFresh] = useState(false);
  const lastId = useRef<number | null>(null);

  const events = data.audit.filter((e) => e.impact).slice(0, SHOWN);
  const latest = events[0];

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!latest) return;
    if (lastId.current !== null && lastId.current !== latest.id) {
      setFresh(true);
      setNow(Date.now());
      const t = setTimeout(() => setFresh(false), 2600);
      lastId.current = latest.id;
      return () => clearTimeout(t);
    }
    lastId.current = latest.id;
  }, [latest]);

  return (
    <div className={"activity one-line" + (fresh ? " fresh" : "")} role="status" aria-live="polite" aria-label={`Live activity, viewing as ${role}`}>
      <span className="act-live">
        <Activity size={13} aria-hidden="true" /> Live
      </span>
      {latest ? (
        <OneLine entry={latest} now={now} />
      ) : (
        <span className="act-empty">Nothing has happened yet. Mark an order delivered and watch who and what it moves.</span>
      )}
      {latest && (
        <button type="button" className="act-more" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls="activity-earlier">
          Details {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
      )}
      {open && latest && (
        <div id="activity-earlier" className="act-earlier">
          {events.map((e, i) => (
            <EventLine key={e.id} entry={e} now={now} big={i === 0} />
          ))}
        </div>
      )}
    </div>
  );
}
