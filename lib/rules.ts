import type { Rules, RuleKey } from "./types.ts";
import { RATES, totalRate } from "./engine.ts";

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
    label: "Credit a sale on",
    options: [
      { value: "lead", label: "Lead" },
      { value: "delivered", label: "Delivery" },
      { value: "cash", label: "Cash in" },
    ],
    explain: (r) =>
      r.creditOn === "lead"
        ? `Every order earns ${pc(totalRate("lead"))} the moment it exists, delivered or not. Cheaper per order, paid on far more of them.`
        : r.creditOn === "delivered"
          ? `${pc(totalRate("delivered"))} once the courier marks it delivered. Closer ${pc(RATES.delivered.closer)} · buyer ${pc(RATES.delivered.buyer)} · lead ${pc(RATES.delivered.lead)}.`
          : `${pc(totalRate("cash"))} only once the courier has remitted the cash. Nothing is paid on money still on a bike in Ikeja.`,
  },
  {
    key: "onReturn",
    label: "When a paid order comes back",
    options: [
      { value: "clawback", label: "Claw back" },
      { value: "offset", label: "Offset next cycle" },
      { value: "absorb", label: "Absorb" },
    ],
    explain: (r) =>
      r.onReturn === "clawback"
        ? "Commission already paid is deducted from this cycle's payout. Unpaid accruals simply reverse."
        : r.onReturn === "offset"
          ? "Commission already paid is recovered from next cycle's payout, so nobody gets a surprise this week."
          : "Commission stays paid. The business carries the loss, and the incentive to over-promise stays intact.",
  },
  {
    key: "split",
    label: "Two closers, one order",
    options: [
      { value: "first", label: "First touch" },
      { value: "last", label: "Last touch" },
      { value: "half", label: "50-50" },
    ],
    explain: (r) =>
      r.split === "first"
        ? "Whoever opened the conversation gets the closer commission."
        : r.split === "last"
          ? "Whoever closed the sale gets the closer commission."
          : "Closer commission is split evenly between opener and closer.",
  },
  {
    key: "discountFloor",
    label: "Discount floor",
    options: [
      { value: 0.05, label: "5%" },
      { value: 0.1, label: "10%" },
      { value: 0.15, label: "15%" },
    ],
    explain: (r) =>
      `Commission is always on the discounted price. Discount more than ${Math.round(r.discountFloor * 100)}% and the closer's rate halves on that order.`,
  },
  {
    key: "returnCap",
    label: "Return-rate quality gate",
    options: [
      { value: 1, label: "Off" },
      { value: 0.3, label: "30% cap" },
      { value: 0.2, label: "20% cap" },
    ],
    explain: (r) =>
      r.returnCap >= 1
        ? "No return-rate penalty. Closers keep full rate even when 35%+ of their deliveries bounce."
        : `If a closer's return rate exceeds ${Math.round(r.returnCap * 100)}%, their commission halves on the cycle — curing over-promising on the phone.`,
  },
  {
    key: "payModel",
    label: "Pay structure",
    options: [
      { value: "commission", label: "Commission only" },
      { value: "base_plus", label: "Base + variable" },
    ],
    explain: (r) =>
      r.payModel === "base_plus"
        ? "Monthly base for closers, buyers and the lead, pro-rated weekly, plus commission on top."
        : "Pure commission. Cheap on a bad week, and it pays people to chase volume over quality.",
  },
];

export const ruleOptionLabel = (key: RuleKey, value: Rules[RuleKey]) =>
  RULE_DEFS.find((d) => d.key === key)?.options.find((o) => o.value === value)?.label ?? String(value);

