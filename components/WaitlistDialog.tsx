"use client";

import { useEffect } from "react";
import { ExternalLink, ShieldCheck, X } from "lucide-react";

/** The hosted Tally form. Visitors type their email into Tally directly; this app never sees or stores it. */
const FORM_ID = "4aQ1LX";
const PAGE_URL = `https://tally.so/r/${FORM_ID}`;
const EMBED_URL = `https://tally.so/embed/${FORM_ID}?hideTitle=1&transparentBackground=1&dynamicHeight=0`;

/** "Join the waitlist": the call to action at the end of the demo. */
export function WaitlistDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div className="scrim" onClick={onClose} aria-hidden="true" />
      <div className="dialog" role="dialog" aria-modal="true" aria-label="Join the waitlist" style={{ width: "min(520px, calc(100vw - 28px))", maxHeight: "90dvh", overflow: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div className="eyebrow">Liked what you saw?</div>
            <h2>Join the waitlist</h2>
          </div>
          <button type="button" className="btn xs ghost" onClick={onClose} aria-label="Close">
            <X size={14} />
          </button>
        </div>

        <iframe
          title="Join the Kova waitlist"
          src={EMBED_URL}
          loading="lazy"
          style={{ width: "100%", height: 380, border: 0, marginTop: 8 }}
        />

        <div className="muted" style={{ display: "grid", gap: 6, fontSize: 11.5 }}>
          <span style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
            <ShieldCheck size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>The form is hosted by Tally, so your email goes to Tally and to us. Nothing from the demo, and nothing from any orders you load, is sent.</span>
          </span>
          <a href={PAGE_URL} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
            Form not showing? Open it in a new tab <ExternalLink size={11} />
          </a>
        </div>
      </div>
    </>
  );
}
