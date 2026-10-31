"use client";

import { useDeferredValue, useMemo, type CSSProperties } from "react";
import { Lock } from "lucide-react";
import { RULE_DEFS } from "@/lib/rules";
import { canEditRules, personOf, whatIf } from "@/lib/engine";
import { shortDate, shortName } from "@/lib/format";
import { useData, useStore } from "@/lib/store";
import { Card, useMoney } from "./ui";
import type { Rules, RuleKey } from "@/lib/types";

export function RulesStrip() {
  const data = useData();
  const role = useStore((s) => s.role);
  const setRule = useStore((s) => s.setRule);
  const m = useMoney();
  const editable = canEditRules(role);

  // Fourteen what-if recalculations. They run once per data change, and after the click has already updated the screen, so a big import stays responsive.
  const lagging = useDeferredValue(data);
  const sims = useMemo(
    () => new Map(RULE_DEFS.flatMap((def) => def.options.map((o) => [`${def.key}:${String(o.value)}`, whatIf(lagging, { [def.key]: o.value } as Partial<Rules>)] as const))),
    [lagging],
  );

  // Latest rule edit across all keys for the header audit stamp
  const latestKey = (Object.keys(data.rulesMeta) as RuleKey[]).reduce((best, k) =>
    new Date(data.rulesMeta[k].at) > new Date(data.rulesMeta[best].at) ? k : best,
  );
  const latestStamp = data.rulesMeta[latestKey];
  const latestPerson = personOf(data, latestStamp.by);

  return (
    <Card
      id="tour-rules"
      title="Pay rules"
      sub={
        editable
          ? "Change a rule and every figure, payslip and profit line recalculates immediately."
          : `Set by the founder. Last changed ${shortDate(latestStamp.at)} by ${shortName(latestPerson.name)}`
      }
      actions={
        !editable ? (
          <span className="pill plain">
            <Lock size={12} style={{ marginRight: 5 }} /> Read-only for your role
          </span>
        ) : (
          <span className="pill brand">Founder authority</span>
        )
      }
      flush
    >
      <div className="rules-grid">
        {RULE_DEFS.map((def) => {
          const current = data.rules[def.key];
          const stamp = data.rulesMeta[def.key];
          const who = personOf(data, stamp.by);
          const activeIdx = Math.max(
            0,
            def.options.findIndex((o) => o.value === current),
          );
          const segStyle = {
            "--n": def.options.length,
            "--i": activeIdx,
          } as CSSProperties;

          return (
            <div className="rule" key={def.key}>
              <div className="rule-top">
                <span className="rule-label" id={`lbl-${def.key}`}>
                  {def.label}
                </span>
              </div>
              <div
                className={"seg has-thumb" + (editable ? "" : " locked")}
                style={segStyle}
                role="group"
                aria-labelledby={`lbl-${def.key}`}
              >
                {def.options.map((opt) => {
                  const active = current === opt.value;
                  const sim = sims.get(`${def.key}:${String(opt.value)}`)!;
                  return (
                    <button
                      key={String(opt.value)}
                      type="button"
                      aria-pressed={active}
                      disabled={!editable}
                      className={editable ? "" : "locked"}
                      onClick={() => setRule(def.key, opt.value as never)}
                      title={
                        editable
                          ? `Staff pay would be ${m(sim.payout)} · Real profit ${m(sim.actual, { sign: true })}`
                          : "Only the founder can change the pay rules"
                      }
                    >
                      <span>{opt.label}</span>
                      <span className="wi">{m(sim.payout, { compact: true })}</span>
                    </button>
                  );
                })}
              </div>
              <small>{def.explain(data.rules)}</small>
              <div className="stamp">
                <Lock size={11} />
                <span>
                  Last changed {shortDate(stamp.at)} by {shortName(who.name)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      {!editable && (
        <div className="lock-banner">
          <Lock size={14} />
          <span>
            <b>Set by the founder.</b> Last changed {shortDate(latestStamp.at)} by {shortName(latestPerson.name)}
          </span>
        </div>
      )}
    </Card>
  );
}
