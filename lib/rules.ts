import type { Rules, RuleKey } from "./types.ts";
import { RATES, totalRate } from "./engine.ts";
import { RULE_TEXT as T } from "./labels.ts";

export interface RuleOption {
  value: Rules[RuleKey];
  label: string;
}
export interface RuleDef {
  key: RuleKey;
  label: string;
  options: RuleOption[];
  explain: (r: Rules) => string;
}

const pc = (n: number) => (n * 100).toFixed(2).replace(/0$/, "").replace(/\.0$/, "") + "%";

export const RULE_DEFS: RuleDef[] = [
  {
    key: "creditOn",
    label: T.creditOn.label,
    options: [
      { value: "lead", label: T.creditOn.options.lead },
      { value: "delivered", label: T.creditOn.options.delivered },
      { value: "cash", label: T.creditOn.options.cash },
    ],
    explain: (r) =>
      r.creditOn === "lead"
        ? T.creditOn.explain.lead(pc(totalRate("lead")))
        : r.creditOn === "delivered"
          ? T.creditOn.explain.delivered(pc(totalRate("delivered")), pc(RATES.delivered.closer), pc(RATES.delivered.buyer), pc(RATES.delivered.lead))
          : T.creditOn.explain.cash(pc(totalRate("cash"))),
  },
  {
    key: "onReturn",
    label: T.onReturn.label,
    options: [
      { value: "clawback", label: T.onReturn.options.clawback },
      { value: "offset", label: T.onReturn.options.offset },
      { value: "absorb", label: T.onReturn.options.absorb },
    ],
    explain: (r) => T.onReturn.explain[r.onReturn],
  },
  {
    key: "split",
    label: T.split.label,
    options: [
      { value: "first", label: T.split.options.first },
      { value: "last", label: T.split.options.last },
      { value: "half", label: T.split.options.half },
    ],
    explain: (r) => T.split.explain[r.split],
  },
  {
    key: "payModel",
    label: T.payModel.label,
    options: [
      { value: "commission", label: T.payModel.options.commission },
      { value: "base_plus", label: T.payModel.options.base_plus },
    ],
    explain: (r) => T.payModel.explain[r.payModel],
  },
  {
    key: "returnCap",
    label: T.returnCap.label,
    options: [
      { value: 1, label: T.returnCap.options["1"] },
      { value: 0.3, label: T.returnCap.options["0.3"] },
      { value: 0.2, label: T.returnCap.options["0.2"] },
    ],
    explain: (r) => (r.returnCap >= 1 ? T.returnCap.explain.off : T.returnCap.explain.on(Math.round(r.returnCap * 100))),
  },
];

export const ruleOptionLabel = (key: RuleKey, value: Rules[RuleKey]) =>
  RULE_DEFS.find((d) => d.key === key)?.options.find((o) => o.value === value)?.label ?? String(value);
