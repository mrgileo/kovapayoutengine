"use client";

import { useEffect } from "react";
import { Lock, X } from "lucide-react";
import { canEditRules, canSeeRules } from "@/lib/engine";
import { useStore } from "@/lib/store";
import { RulesBody } from "./RulesStrip";

/** The pay rules live in a drawer, off the main page. The founder edits them; the accountant can read them.
 *  Closers, media buyers, leads and the warehouse do not see them (the founder tells them by email). */
export function RulesDrawer() {
  const open = useStore((s) => s.rulesOpen);
  const setOpen = useStore((s) => s.setRulesOpen);
  const role = useStore((s) => s.role);
  const editable = canEditRules(role);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  if (!open || !canSeeRules(role)) return null;

  return (
    <>
      <div className="scrim" onClick={() => setOpen(false)} aria-hidden="true" />
      <aside className="drawer rules-drawer" id="tour-rules" role="dialog" aria-modal="true" aria-label="Pay rules">
        <header className="drawer-head">
          <div>
            <div className="eyebrow">{editable ? "Founder authority" : "Read-only for your role"}</div>
            <h2>Pay rules</h2>
            <p>
              {editable
                ? "Change a rule and every figure, payslip and profit line recalculates immediately."
                : "Set by the founder. You can read them but not change them."}
            </p>
          </div>
          <button type="button" className="btn ghost sm" onClick={() => setOpen(false)} aria-label="Close pay rules">
            {editable ? <X size={18} /> : <Lock size={16} />}
          </button>
        </header>
        <div className="drawer-body rules-drawer-body">
          <RulesBody />
        </div>
      </aside>
    </>
  );
}
