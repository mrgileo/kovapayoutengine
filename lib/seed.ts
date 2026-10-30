import type { DemoState, Order, Person, Product, Rules, RuleKey, Stamp } from "./types.ts";
import { closeCycle, lockCycle, log, markPaid } from "./engine.ts";

export const SEED_VERSION = 7;
export const DEFAULT_MAX_COST_PER_ORDER = 4000;

const people: Person[] = [
  { id: "amaka", name: "Amaka Obi", role: "closer", title: "Closer", monthlyBase: 70000, reportsTo: "ngozi" },
  { id: "chidi", name: "Chidi Nwosu", role: "closer", title: "Closer", monthlyBase: 70000, reportsTo: "ngozi" },
  { id: "tobi", name: "Tobi Ade", role: "buyer", title: "Media buyer", monthlyBase: 120000 },
  { id: "zainab", name: "Zainab Bello", role: "buyer", title: "Media buyer", monthlyBase: 120000 },
  { id: "ngozi", name: "Ngozi Eze", role: "lead", title: "Team lead · Sales", monthlyBase: 150000 },
  { id: "dayo", name: "Dayo Aremu", role: "stock", title: "Inventory · Lagos warehouse", monthlyBase: 0 },
  { id: "chidinma", name: "Chidinma Okoro", role: "founder", title: "Founder & CEO", monthlyBase: 0 },
];

const products: Product[] = [
  { sku: "AIR-12", name: "Air fryer 5.5L", onHand: 4, reorder: 3, cost: 78000, leadDays: 7 },
  { sku: "BLN-07", name: "Blender Pro 1200W", onHand: 12, reorder: 4, cost: 34000, leadDays: 5 },
  { sku: "KET-03", name: "Electric kettle 1.7L", onHand: 2, reorder: 5, cost: 19500, leadDays: 4 },
  { sku: "VAC-21", name: "Handheld vacuum", onHand: 2, reorder: 3, cost: 96000, leadDays: 10 },
  { sku: "STM-09", name: "Garment steamer", onHand: 9, reorder: 3, cost: 52000, leadDays: 6 },
];

type Seed = Partial<Order> & Pick<Order, "id" | "customer" | "city" | "sku" | "list" | "closer" | "buyer" | "stage">;

function mk(cycle: string, x: Seed): Order {
  const landed = x.stage === "delivered" || x.stage === "returned";
  return {
    qty: 1,
    discount: 0,
    openedBy: x.closer,
    cashIn: landed,
    createdCycle: cycle,
    deliveredCycle: landed ? cycle : undefined,
    reversedCycle: x.stage === "returned" || x.stage === "cancelled" ? cycle : undefined,
    returnCondition: x.stage === "returned" ? "resellable" : undefined,
    ...x,
  };
}

const W42: Order[] = [
  mk("W42", { id: 1021, customer: "Grace Etim", city: "Port Harcourt", sku: "BLN-07", list: 57000, closer: "chidi", buyer: "zainab", stage: "delivered" }),
  mk("W42", { id: 1023, customer: "Ifeanyi Okeke", city: "Lagos", sku: "AIR-12", list: 189000, closer: "amaka", buyer: "tobi", stage: "returned" }),
  mk("W42", { id: 1024, customer: "Halima Sani", city: "Abuja", sku: "STM-09", list: 98000, closer: "amaka", buyer: "zainab", stage: "delivered" }),
  mk("W42", { id: 1026, customer: "Dapo Ogunleye", city: "Ibadan", sku: "KET-03", list: 39000, closer: "chidi", buyer: "zainab", stage: "delivered" }),
  mk("W42", { id: 1027, customer: "Uche Mba", city: "Enugu", sku: "VAC-21", list: 182000, closer: "amaka", buyer: "tobi", stage: "delivered" }),
  mk("W42", { id: 1028, customer: "Zara Ahmed", city: "Kano", sku: "BLN-07", list: 66000, closer: "amaka", buyer: "tobi", stage: "cancelled", failed: true }),
];

const W43: Order[] = [
  mk("W43", { id: 1031, customer: "Ada Nnamdi", city: "Lagos", sku: "BLN-07", list: 61000, closer: "amaka", buyer: "zainab", stage: "delivered" }),
  mk("W43", { id: 1033, customer: "Kelechi Nnaji", city: "Abuja", sku: "AIR-12", list: 198000, closer: "amaka", buyer: "tobi", stage: "delivered" }),
  mk("W43", { id: 1034, customer: "Musa Danjuma", city: "Kano", sku: "STM-09", list: 104000, closer: "chidi", buyer: "zainab", stage: "delivered" }),
  mk("W43", { id: 1036, customer: "Funke Akande", city: "Lagos", sku: "KET-03", list: 41000, closer: "amaka", buyer: "tobi", stage: "returned" }),
  mk("W43", { id: 1037, customer: "Obinna Uche", city: "Enugu", sku: "VAC-21", list: 176000, closer: "amaka", buyer: "tobi", stage: "returned" }),
  mk("W43", { id: 1038, customer: "Rasheed Bello", city: "Ibadan", sku: "KET-03", qty: 2, list: 78000, closer: "chidi", buyer: "tobi", stage: "delivered" }),
];

const W44: Order[] = [
  mk("W44", { id: 1041, customer: "Blessing Adeyemi", city: "Lagos", sku: "AIR-12", list: 128000, closer: "amaka", buyer: "zainab", stage: "delivered" }),
  mk("W44", { id: 1042, customer: "Emeka Okafor", city: "Ibadan", sku: "KET-03", qty: 2, list: 64500, closer: "chidi", buyer: "tobi", stage: "delivered" }),
  mk("W44", { id: 1043, customer: "Fatima Yusuf", city: "Abuja", sku: "AIR-12", list: 212000, closer: "amaka", buyer: "tobi", stage: "dispatched" }),
  mk("W44", { id: 1044, customer: "Segun Balogun", city: "Lagos", sku: "KET-03", list: 45000, closer: "chidi", buyer: "zainab", stage: "delivered" }),
  mk("W44", { id: 1045, customer: "Ifeoma Chukwu", city: "Enugu", sku: "VAC-21", qty: 2, list: 318000, closer: "amaka", buyer: "tobi", stage: "confirmed" }),
  mk("W44", { id: 1046, customer: "Yakubu Musa", city: "Kano", sku: "BLN-07", list: 96000, closer: "chidi", buyer: "zainab", stage: "returned" }),
  mk("W44", { id: 1047, customer: "Ngozi Okonkwo", city: "Port Harcourt", sku: "STM-09", list: 152000, closer: "amaka", buyer: "tobi", stage: "delivered", cashIn: false }),
  mk("W44", { id: 1048, customer: "Tunde Bakare", city: "Lagos", sku: "BLN-07", list: 73500, closer: "chidi", buyer: "zainab", stage: "new" }),
  mk("W44", { id: 1049, customer: "Hauwa Ibrahim", city: "Abuja", sku: "AIR-12", list: 245000, discount: 0.15, closer: "amaka", buyer: "tobi", stage: "confirmed" }),
  mk("W44", { id: 1050, customer: "Chinedu Eze", city: "Enugu", sku: "BLN-07", list: 58000, closer: "chidi", buyer: "zainab", stage: "delivered", cashIn: false }),
  mk("W44", { id: 1051, customer: "Aisha Lawal", city: "Kano", sku: "VAC-21", list: 187000, closer: "amaka", buyer: "tobi", stage: "new" }),
  mk("W44", { id: 1052, customer: "Bola Adewale", city: "Lagos", sku: "STM-09", list: 112000, closer: "chidi", buyer: "zainab", stage: "dispatched" }),
  mk("W44", { id: 1053, customer: "Kemi Adebayo", city: "Ibadan", sku: "BLN-07", list: 88000, openedBy: "amaka", closer: "chidi", buyer: "tobi", stage: "dispatched" }),
];

const rules: Rules = { creditOn: "delivered", onReturn: "clawback", split: "last", discountFloor: 0.1, returnCap: 1, payModel: "base_plus" };
const rulesMeta: Record<RuleKey, Stamp> = {
  creditOn: { by: "chidinma", at: "2026-03-14T10:20:00+01:00" },
  onReturn: { by: "chidinma", at: "2026-03-14T10:20:00+01:00" },
  split: { by: "chidinma", at: "2026-03-14T10:20:00+01:00" },
  discountFloor: { by: "chidinma", at: "2026-03-14T10:20:00+01:00" },
  returnCap: { by: "chidinma", at: "2026-03-14T10:20:00+01:00" },
  payModel: { by: "chidinma", at: "2026-03-14T10:20:00+01:00" },
};

export function buildSeed(): DemoState {
  const d: DemoState = {
    version: SEED_VERSION,
    people: structuredClone(people),
    products: structuredClone(products),
    orders: [],
    cycles: [{ id: "W42", start: "2026-10-12", end: "2026-10-18", status: "open", carryIn: [] }],
    rules: { ...rules },
    rulesMeta: structuredClone(rulesMeta),
    spend: { W42: { tobi: 160000, zainab: 88000 } },
    maxCostPerOrder: DEFAULT_MAX_COST_PER_ORDER,
    pos: [],
    audit: [],
    seq: 0,
  };

  // Replay history through the same engine the UI uses, so closed cycles are consistent.
  d.orders.push(...structuredClone(W42));
  closeCycle(d, "chidinma", "2026-10-19T09:12:00+01:00");
  markPaid(d, "W42", "chidinma", "2026-10-20T10:03:00+01:00");
  lockCycle(d, "W42", "chidinma", "2026-10-26T08:40:00+01:00");
  d.spend.W43 = { tobi: 172000, zainab: 92000 };

  d.orders.push(...structuredClone(W43));
  closeCycle(d, "chidinma", "2026-10-26T09:05:00+01:00");
  markPaid(d, "W43", "chidinma", "2026-10-27T11:20:00+01:00");
  d.spend.W44 = { tobi: 185000, zainab: 96000 };

  d.orders.push(...structuredClone(W44));

  const seedLog: [string, string, string, Parameters<typeof log>[1]["kind"], string][] = [
    ["2026-10-19T09:12:00+01:00", "chidinma", "W42", "cycle", "Closed and approved W42 payouts"],
    ["2026-10-20T10:03:00+01:00", "chidinma", "W42", "cycle", "Marked W42 paid · bank file exported"],
    ["2026-10-26T08:40:00+01:00", "chidinma", "W42", "cycle", "Locked W42 · return window closed"],
    ["2026-10-26T09:05:00+01:00", "chidinma", "W43", "cycle", "Closed and approved W43 payouts"],
    ["2026-10-27T11:20:00+01:00", "chidinma", "W43", "cycle", "Marked W43 paid · bank file exported"],
    ["2026-10-27T15:42:00+01:00", "dayo", "W44", "order", "Order 1046 returned · BLN-07 +1 restocked"],
    ["2026-10-28T10:15:00+01:00", "amaka", "W44", "discount", "Order 1049 discounted 15% · past the 10% floor, closer rate halved"],
    ["2026-10-28T17:30:00+01:00", "dayo", "W44", "order", "Order 1053 dispatched · opened by Amaka, closed by Chidi"],
  ];
  for (const [at, actor, cycle, kind, text] of seedLog) log(d, { at, actor, cycle, kind, text });
  return d;
}

