// The "are you sure?" layer, kept pure so it can be tested without a browser. An AskRequest describes one permanent
// action: what it will do, what it will change (computed by running the real engine on a copy), and whether the
// person must leave a reason or reference before it can go ahead.
import type { DemoState, Impact, Role } from "./types.ts";
import { cashWithCourier, cloneState, impactFor, impactOf, viewerOf } from "./engine.ts";

export interface AskChoice {
  value: string;
  label: string;
  detail: string;
}

export interface NoteSpec {
  label: string;
  placeholder: string;
  required: boolean;
}

export interface AskRequest {
  eyebrow: string;
  title: string;
  body: string;
  confirmLabel: string;
  tone: "danger" | "primary";
  /** Small fact table under the body (rule in force, week status…). */
  lines?: { label: string; value: string }[];
  /** A pick the person must make, e.g. the condition a returned parcel came back in. */
  choices?: { label: string; options: AskChoice[]; initial: string };
  note?: NoteSpec;
  /** Run the real engine mutator on a copy to preview the effect. Return a string to say why it cannot happen. */
  simulate?: (d: DemoState, choice: string | undefined) => string | void;
  run: (note: string, choice: string | undefined) => void;
}

/** Which actions make the person say why. Money leaving, goods lost, or a week closing for good. */
export const NOTE_SPECS = {
  cancel: { label: "Why is this order cancelled?", placeholder: "e.g. customer changed their mind", required: true },
  fail: { label: "Why did the delivery fail?", placeholder: "e.g. phone off, wrong address, customer refused", required: true },
  return: { label: "Why was it returned?", placeholder: "e.g. wrong size, customer refused at the door", required: true },
  cash: { label: "Courier reference", placeholder: "e.g. GIG-20481 or the remittance slip number", required: true },
  markPaid: { label: "Bank reference", placeholder: "e.g. the transfer batch number", required: true },
  lockCycle: { label: "Why lock now?", placeholder: "e.g. return window over, bank file reconciled", required: true },
  price: { label: "Why is the price changing?", placeholder: "e.g. supplier cost went up", required: true },
} satisfies Record<string, NoteSpec>;

export type NoteKey = keyof typeof NOTE_SPECS;

/** The fixed warning shown on every dialog. */
export const PERMANENT_WARNING =
  "This is recorded in the audit log with your name and the time. It is permanent and cannot be undone.";

/** True when the person still owes a required note (empty or only spaces). */
export function noteMissing(req: Pick<AskRequest, "note">, note: string): boolean {
  return !!req.note?.required && note.trim().length === 0;
}

export interface Preview {
  impact: Impact | null;
  /** Set when the engine refuses the action on the copy (not enough stock, wrong state…). */
  blocked: string | null;
}

/** What the action would change for this viewer, from running the engine on a copy. */
export function previewImpact(
  data: DemoState,
  req: Pick<AskRequest, "simulate">,
  choice: string | undefined,
  role: Role,
  viewers: Partial<Record<Role, string>>,
  /** The "before" figures the screen already holds (from lib/derived), so only the "after" side is worked out. */
  known?: Parameters<typeof impactOf>[2],
): Preview {
  if (!req.simulate) return { impact: null, blocked: null };
  const after = cloneState(data);
  let err: string | void;
  try {
    err = req.simulate(after, choice);
  } catch {
    return { impact: null, blocked: null };
  }
  if (typeof err === "string") return { impact: null, blocked: err };
  const me = viewerOf(data, role, viewers);
  return { impact: impactFor(after, impactOf(data, after, known), role, me), blocked: null };
}
