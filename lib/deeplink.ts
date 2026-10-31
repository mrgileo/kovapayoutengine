import type { Role, Rules } from "./types.ts";
import { RULE_DEFS } from "./rules.ts";

export const LINK_ROLES: Role[] = ["founder", "closer", "buyer", "lead", "accountant", "stock"];

/** What a shared link asks for: a persona tab and, optionally, pay rules. Anything not recognised is ignored. */
export interface DeepLink {
  role?: Role;
  rules: Partial<Rules>;
}

/** Reads `?role=closer&creditOn=lead&onReturn=offset…`. Values are matched against the real options, so a bad link does nothing. */
export function parseDeepLink(search: string): DeepLink {
  const q = new URLSearchParams(search);
  const out: DeepLink = { rules: {} };
  const role = q.get("role");
  if (role && (LINK_ROLES as string[]).includes(role)) out.role = role as Role;
  for (const def of RULE_DEFS) {
    const raw = q.get(def.key);
    if (raw === null) continue;
    const opt = def.options.find((o) => String(o.value) === raw);
    if (opt) (out.rules as Record<string, unknown>)[def.key] = opt.value;
  }
  return out;
}

export const isEmptyLink = (l: DeepLink) => !l.role && Object.keys(l.rules).length === 0;

/** The link that reopens this persona with these rules; rules still at the demo default are left out. */
export function buildDeepLink(base: string, role: Role, rules: Rules, defaults: Rules): string {
  const q = new URLSearchParams({ role });
  for (const def of RULE_DEFS) {
    if (rules[def.key] !== defaults[def.key]) q.set(def.key, String(rules[def.key]));
  }
  return `${base}?${q.toString()}`;
}
