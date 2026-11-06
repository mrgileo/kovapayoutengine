"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { cashWithCourier, impactIsEmpty, personOf } from "@/lib/engine";
import { linesOf, pnlOf, stockRowsOf } from "@/lib/derived";
import { PERMANENT_WARNING, noteMissing, previewImpact, type Preview } from "@/lib/ask";
import { shortName } from "@/lib/format";
import { useData, useStore } from "@/lib/store";
import { LoadingButton, afterPaint, useMoney } from "./ui";

/**
 * The one "are you sure?" dialog for every permanent action. It shows what is about to happen, what it will change
 * (the real engine run on a copy, scoped to what this role may see), a fixed warning, and a required note on the
 * risky actions. Confirm stays disabled until the note is filled in.
 */
export function ActionDialog() {
  const req = useStore((s) => s.asking);
  const cancel = useStore((s) => s.cancelAsk);
  const confirm = useStore((s) => s.confirmAsk);
  const role = useStore((s) => s.role);
  const viewers = useStore((s) => s.viewers);
  const data = useData();
  const m = useMoney();

  const [note, setNote] = useState("");
  const [choice, setChoice] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const okRef = useRef<HTMLButtonElement>(null);

  // A fresh note and pick for every request: one order's reason never carries over to the next.
  useEffect(() => {
    setNote("");
    setBusy(false);
    setChoice(req?.choices?.initial);
    if (req) requestAnimationFrame(() => (noteRef.current ?? okRef.current)?.focus());
  }, [req]);

  useEffect(() => {
    if (!req) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && cancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [req, cancel]);

  // The preview runs the real engine on a copy, which takes a moment on a big company. Show the dialog first, then fill it in.
  const [preview, setPreview] = useState<Preview | null>(null);
  const [working, setWorking] = useState(false);
  useEffect(() => {
    if (!req?.simulate) {
      setPreview(null);
      setWorking(false);
      return;
    }
    let live = true;
    setPreview(null);
    setWorking(true);
    void afterPaint().then(() => {
      if (!live) return;
      // What the page already shows is reused for the "before" side, so only the "after" side is worked out.
      const known = { lines: linesOf(data), pnl: pnlOf(data), stock: stockRowsOf(data), stuckCash: cashWithCourier(data).total };
      setPreview(previewImpact(data, req, choice, role, viewers, known));
      setWorking(false);
    });
    return () => {
      live = false;
    };
  }, [req, data, choice, role, viewers]);

  if (!req) return null;
  const imp = preview?.impact && !impactIsEmpty(preview.impact) ? preview.impact : null;
  const missing = noteMissing(req, note);
  const blocked = preview?.blocked ?? null;

  return (
    <>
      <div className="scrim ask-scrim" onClick={cancel} aria-hidden="true" />
      <div className="dialog ask-dialog" role="dialog" aria-modal="true" aria-label={req.title} data-testid="action-dialog">
        <div>
          <div className="eyebrow">{req.eyebrow}</div>
          <h2>{req.title}</h2>
          <p>{req.body}</p>
        </div>

        {req.choices && (
          <div className="choice" role="group" aria-label={req.choices.label}>
            {req.choices.options.map((o) => (
              <button key={o.value} type="button" aria-pressed={choice === o.value} onClick={() => setChoice(o.value)}>
                <b>{o.label}</b>
                <span>{o.detail}</span>
              </button>
            ))}
          </div>
        )}

        {req.lines && req.lines.length > 0 && (
          <div className="calc">
            {req.lines.map((l, i) => (
              <div key={l.label} className={i === req.lines!.length - 1 ? "tot" : undefined}>
                <span>{l.label}</span>
                <span className="mono">{l.value}</span>
              </div>
            ))}
          </div>
        )}

        {working && (
          <p className="muted ask-working" role="status" aria-live="polite">
            <span className="spin" aria-hidden="true" /> Working out what this will change…
          </p>
        )}

        {blocked && (
          <div className="ask-blocked" role="alert">
            <AlertTriangle size={14} /> <span>{blocked}</span>
          </div>
        )}

        {imp && (
          <div className="ask-impact" aria-label="What this will change">
            <div className="eyebrow">What this will change</div>
            <ul>
              {imp.pay.map((p) => (
                <li key={p.personId}>
                  <span>{shortName(personOf(data, p.personId).name)}&apos;s pay this week</span>
                  <span className={"mono " + (p.amount < 0 ? "neg" : "pos")}>{m(p.amount, { sign: true })}</span>
                </li>
              ))}
              {imp.revenue !== undefined && (
                <li>
                  <span>Delivered sales</span>
                  <span className={"mono " + (imp.revenue < 0 ? "neg" : "pos")}>{m(imp.revenue, { sign: true })}</span>
                </li>
              )}
              {imp.profit !== undefined && (
                <li>
                  <span>Real profit</span>
                  <span className={"mono " + (imp.profit < 0 ? "neg" : "pos")}>{m(imp.profit, { sign: true })}</span>
                </li>
              )}
              {imp.stuckCash !== undefined && (
                <li>
                  <span>Cash still with couriers</span>
                  <span className={"mono " + (imp.stuckCash > 0 ? "neg" : "pos")}>{m(imp.stuckCash, { sign: true })}</span>
                </li>
              )}
              {imp.stock.map((s) => (
                <li key={s.sku}>
                  <span>{s.sku} on the shelf</span>
                  <span className="mono">
                    {s.onHand[0]} → {s.onHand[1]}
                    {s.available[0] !== s.available[1] && ` · free ${s.available[0]} → ${s.available[1]}`}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {req.note && (
          <label className="ask-note">
            <span>
              {req.note.label}
              {req.note.required && <b aria-hidden="true"> *</b>}
            </span>
            <textarea
              ref={noteRef}
              rows={2}
              value={note}
              maxLength={300}
              placeholder={req.note.placeholder}
              onChange={(e) => setNote(e.target.value)}
              aria-required={req.note.required}
            />
          </label>
        )}

        <p className="ask-warning" role="note">
          <AlertTriangle size={14} /> <span>{PERMANENT_WARNING}</span>
        </p>

        <div className="dialog-foot">
          <button type="button" className="btn ghost" onClick={cancel}>
            Cancel
          </button>
          <LoadingButton
            ref={okRef}
            className={"btn " + (req.tone === "danger" ? "danger" : "primary")}
            busy={busy}
            disabled={missing || !!blocked || working}
            title={missing ? "Write the reason first" : working ? "Working out what this will change" : undefined}
            onClick={async () => {
              // Show the spinner first: the work behind a confirm can take a moment on a big company.
              setBusy(true);
              await afterPaint();
              confirm(note, choice);
            }}
          >
            {req.confirmLabel}
          </LoadingButton>
        </div>
      </div>
    </>
  );
}
