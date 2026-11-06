import type { DemoState, Lead, LeadSource, Order, Person, Product, Rules, RuleKey, Stamp } from "./types.ts";
import { closeCycle, impactOf, lockCycle, log, markPaid } from "./engine.ts";

export const SEED_VERSION = 13;
export const DEFAULT_MAX_COST_PER_ORDER = 4000;

/** Every quantity in the demo (order units, shelf stock, reorder levels, ad spend) is ten times the original small
 *  sample, so the books look like a real operation: about ₦5.3M of delivered sales in the current week. */
const SCALE = 10;

const people: Person[] = [
  { id: "amaka", name: "Amaka Obi", role: "closer", title: "Closer", monthlyBase: 70000, reportsTo: "ngozi" },
  { id: "chidi", name: "Chidi Nwosu", role: "closer", title: "Closer", monthlyBase: 70000, reportsTo: "ngozi" },
  { id: "tobi", name: "Tobi Ade", role: "buyer", title: "Media buyer", monthlyBase: 120000 },
  { id: "zainab", name: "Zainab Bello", role: "buyer", title: "Media buyer", monthlyBase: 120000 },
  { id: "ngozi", name: "Ngozi Eze", role: "lead", title: "Team lead · Sales", monthlyBase: 150000 },
  { id: "dayo", name: "Dayo Aremu", role: "stock", title: "Inventory · Lagos warehouse", monthlyBase: 0 },
  { id: "bisi", name: "Bisi Adeyemi", role: "accountant", title: "Accountant · Finance", monthlyBase: 0 },
  { id: "chidinma", name: "Chidinma Okoro", role: "founder", title: "Founder & CEO", monthlyBase: 0 },
];

const products: Product[] = ([
  { sku: "AIR-12", name: "Air fryer 5.5L", onHand: 4, reorder: 3, cost: 78000, price: 212000, leadDays: 7 },
  { sku: "BLN-07", name: "Blender Pro 1200W", onHand: 12, reorder: 4, cost: 34000, price: 73500, leadDays: 5 },
  { sku: "KET-03", name: "Electric kettle 1.7L", onHand: 2, reorder: 5, cost: 19500, price: 45000, leadDays: 4 },
  { sku: "VAC-21", name: "Handheld vacuum", onHand: 2, reorder: 3, cost: 96000, price: 187000, leadDays: 10 },
  { sku: "STM-09", name: "Garment steamer", onHand: 9, reorder: 3, cost: 52000, price: 112000, leadDays: 6 },
] as Product[]).map((p) => ({ ...p, onHand: p.onHand * SCALE, reorder: p.reorder * SCALE }));

type Seed = Partial<Order> & Pick<Order, "id" | "customer" | "city" | "sku" | "closer" | "buyer" | "stage">;

function mk(cycle: string, x: Seed): Order {
  const landed = x.stage === "delivered" || x.stage === "returned";
  return {
    unitPrice: products.find((p) => p.sku === x.sku)!.price,
    openedBy: x.closer,
    cashIn: landed,
    createdCycle: cycle,
    deliveredCycle: landed ? cycle : undefined,
    reversedCycle: x.stage === "returned" || x.stage === "cancelled" ? cycle : undefined,
    returnCondition: x.stage === "returned" ? "resellable" : undefined,
    ...x,
    qty: (x.qty ?? 1) * SCALE,
  };
}

const W42: Order[] = [
  mk("W42", { id: 1021, customer: "Grace Etim", city: "Port Harcourt", sku: "BLN-07", closer: "chidi", buyer: "zainab", stage: "delivered" }),
  mk("W42", { id: 1023, customer: "Ifeanyi Okeke", city: "Lagos", sku: "AIR-12", closer: "amaka", buyer: "tobi", stage: "returned" }),
  mk("W42", { id: 1024, customer: "Halima Sani", city: "Abuja", sku: "STM-09", closer: "amaka", buyer: "zainab", stage: "delivered" }),
  mk("W42", { id: 1026, customer: "Dapo Ogunleye", city: "Ibadan", sku: "KET-03", closer: "chidi", buyer: "zainab", stage: "delivered" }),
  mk("W42", { id: 1027, customer: "Uche Mba", city: "Enugu", sku: "VAC-21", closer: "amaka", buyer: "tobi", stage: "delivered" }),
  mk("W42", { id: 1028, customer: "Zara Ahmed", city: "Kano", sku: "BLN-07", closer: "amaka", buyer: "tobi", stage: "cancelled", failed: true }),
];

const W43: Order[] = [
  mk("W43", { id: 1031, customer: "Ada Nnamdi", city: "Lagos", sku: "BLN-07", closer: "amaka", buyer: "zainab", stage: "delivered" }),
  mk("W43", { id: 1033, customer: "Kelechi Nnaji", city: "Abuja", sku: "AIR-12", closer: "amaka", buyer: "tobi", stage: "delivered" }),
  mk("W43", { id: 1034, customer: "Musa Danjuma", city: "Kano", sku: "STM-09", closer: "chidi", buyer: "zainab", stage: "delivered" }),
  mk("W43", { id: 1036, customer: "Funke Akande", city: "Lagos", sku: "KET-03", closer: "amaka", buyer: "tobi", stage: "returned" }),
  mk("W43", { id: 1037, customer: "Obinna Uche", city: "Enugu", sku: "VAC-21", closer: "amaka", buyer: "tobi", stage: "returned" }),
  mk("W43", { id: 1038, customer: "Rasheed Bello", city: "Ibadan", sku: "KET-03", qty: 2, closer: "chidi", buyer: "tobi", stage: "delivered" }),
];

const W44: Order[] = [
  mk("W44", { id: 1041, customer: "Blessing Adeyemi", city: "Lagos", sku: "AIR-12", closer: "amaka", buyer: "zainab", stage: "delivered" }),
  mk("W44", { id: 1042, customer: "Emeka Okafor", city: "Ibadan", sku: "KET-03", qty: 2, closer: "chidi", buyer: "tobi", stage: "delivered" }),
  mk("W44", { id: 1043, customer: "Fatima Yusuf", city: "Abuja", sku: "AIR-12", closer: "amaka", buyer: "tobi", stage: "dispatched" }),
  mk("W44", { id: 1044, customer: "Segun Balogun", city: "Lagos", sku: "KET-03", closer: "chidi", buyer: "zainab", stage: "delivered" }),
  mk("W44", { id: 1045, customer: "Ifeoma Chukwu", city: "Enugu", sku: "VAC-21", qty: 2, closer: "amaka", buyer: "tobi", stage: "confirmed" }),
  mk("W44", { id: 1046, customer: "Yakubu Musa", city: "Kano", sku: "BLN-07", closer: "chidi", buyer: "zainab", stage: "returned" }),
  mk("W44", { id: 1047, customer: "Ngozi Okonkwo", city: "Port Harcourt", sku: "STM-09", closer: "amaka", buyer: "tobi", stage: "delivered", cashIn: false }),
  mk("W44", { id: 1048, customer: "Tunde Bakare", city: "Lagos", sku: "BLN-07", closer: "chidi", buyer: "zainab", stage: "cancelled", failed: true }),
  mk("W44", { id: 1049, customer: "Hauwa Ibrahim", city: "Abuja", sku: "AIR-12", closer: "amaka", buyer: "tobi", stage: "confirmed" }),
  mk("W44", { id: 1050, customer: "Chinedu Eze", city: "Enugu", sku: "BLN-07", closer: "chidi", buyer: "zainab", stage: "delivered", cashIn: false }),
  mk("W44", { id: 1051, customer: "Aisha Lawal", city: "Kano", sku: "VAC-21", closer: "amaka", buyer: "tobi", stage: "new" }),
  mk("W44", { id: 1052, customer: "Bola Adewale", city: "Lagos", sku: "STM-09", closer: "chidi", buyer: "zainab", stage: "dispatched" }),
  mk("W44", { id: 1053, customer: "Kemi Adebayo", city: "Ibadan", sku: "BLN-07", openedBy: "amaka", closer: "chidi", buyer: "tobi", stage: "dispatched" }),
];

const rules: Rules = { creditOn: "delivered", onReturn: "clawback", split: "last", returnCap: 1, payModel: "base_plus" };
const rulesMeta: Record<RuleKey, Stamp> = {
  creditOn: { by: "chidinma", at: "2026-03-14T10:20:00+01:00" },
  onReturn: { by: "chidinma", at: "2026-03-14T10:20:00+01:00" },
  split: { by: "chidinma", at: "2026-03-14T10:20:00+01:00" },
  returnCap: { by: "chidinma", at: "2026-03-14T10:20:00+01:00" },
  payModel: { by: "chidinma", at: "2026-03-14T10:20:00+01:00" },
};

/** W44 Leads: 29 came in, 13 became the orders above (45%), 12 were lost and 4 have not been reached yet.
 *  Most arrive as landing-page form fills. Leads never reserve stock or earn pay; only the booked order does. */
function buildLeads(orders: Order[]): Lead[] {
  const bookedSource: LeadSource[] = ["web_form", "web_form", "whatsapp", "web_form", "web_form", "call", "web_form", "web_form", "whatsapp", "web_form", "web_form", "whatsapp", "web_form"];
  const leads: Lead[] = orders
    .filter((o) => o.createdCycle === "W44")
    .map((o, i) => ({ id: 2001 + i, cycle: "W44", customer: o.customer, city: o.city, source: bookedSource[i], status: "booked" as const, orderId: o.id }));
  const lost: [string, string, LeadSource, string][] = [
    ["Nkechi Obi", "Lagos", "web_form", "Never picked up the call"],
    ["Samuel Eze", "Abuja", "web_form", "Never picked up the call"],
    ["Rukky Alade", "Lagos", "web_form", "Said the price was too high"],
    ["Peter Nwosu", "Port Harcourt", "web_form", "Just browsing"],
    ["Joy Ekpo", "Enugu", "web_form", "Wrong number"],
    ["Ahmed Garba", "Kano", "web_form", "Never picked up the call"],
    ["Titi Coker", "Lagos", "web_form", "Changed their mind"],
    ["Ugo Anyanwu", "Ibadan", "web_form", "Said the price was too high"],
    ["Bimpe Salako", "Lagos", "whatsapp", "Stopped replying"],
    ["Femi Okon", "Abuja", "whatsapp", "Said the price was too high"],
    ["Dozie Obi", "Enugu", "call", "Ordered from someone else"],
    ["Lola Martins", "Lagos", "instagram", "Just browsing"],
  ];
  const open: [string, string, LeadSource][] = [
    ["Gift Udo", "Lagos", "web_form"],
    ["Zubair Lawal", "Kano", "web_form"],
    ["Amara Ndu", "Abuja", "web_form"],
    ["Kola Fashola", "Ibadan", "instagram"],
  ];
  let id = 2001 + leads.length;
  for (const [customer, city, source, reason] of lost) leads.push({ id: id++, cycle: "W44", customer, city, source, status: "lost", reason });
  for (const [customer, city, source] of open) leads.push({ id: id++, cycle: "W44", customer, city, source, status: "open" });
  return leads;
}

export function buildSeed(): DemoState {
  const d: DemoState = {
    version: SEED_VERSION,
    people: structuredClone(people),
    products: structuredClone(products),
    orders: [],
    leads: [],
    cycles: [{ id: "W42", start: "2026-10-12", end: "2026-10-18", status: "open", carryIn: [] }],
    rules: { ...rules },
    rulesMeta: structuredClone(rulesMeta),
    spend: { W42: { tobi: 160000 * SCALE, zainab: 88000 * SCALE } },
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
  d.spend.W43 = { tobi: 172000 * SCALE, zainab: 92000 * SCALE };

  d.orders.push(...structuredClone(W43));
  closeCycle(d, "chidinma", "2026-10-26T09:05:00+01:00");
  markPaid(d, "W43", "chidinma", "2026-10-27T11:20:00+01:00");
  d.spend.W44 = { tobi: 55000 * SCALE, zainab: 35000 * SCALE };

  d.orders.push(...structuredClone(W44));
  d.leads = buildLeads(d.orders);

  const seedLog: [string, string, string, Parameters<typeof log>[1]["kind"], string][] = [
    ["2026-10-19T09:12:00+01:00", "chidinma", "W42", "cycle", "Closed and approved W42 payouts"],
    ["2026-10-20T10:03:00+01:00", "chidinma", "W42", "cycle", "Marked W42 paid · bank file exported"],
    ["2026-10-26T08:40:00+01:00", "chidinma", "W42", "cycle", "Locked W42 · return window closed"],
    ["2026-10-26T09:05:00+01:00", "chidinma", "W43", "cycle", "Closed and approved W43 payouts"],
    ["2026-10-27T11:20:00+01:00", "chidinma", "W43", "cycle", "Marked W43 paid · bank file exported"],
    ["2026-10-27T15:42:00+01:00", "dayo", "W44", "order", "Order 1046 returned · BLN-07 +1 restocked"],
    ["2026-10-28T17:30:00+01:00", "dayo", "W44", "order", "Order 1053 dispatched · opened by Amaka, closed by Chidi"],
  ];
  for (const [at, actor, cycle, kind, text] of seedLog) log(d, { at, actor, cycle, kind, text });

  // Two live events with real impact, so the activity strip opens with a story instead of "nothing yet":
  // a delivery whose cash is still with the courier, and a failed delivery. The earlier state is rebuilt by hand
  // so the final seed (stock levels included) stays exactly as laid out above.
  const event = (orderId: number, at: string, text: string, rewind: (before: DemoState) => void) => {
    const before = structuredClone(d);
    rewind(before);
    log(d, { at, actor: "dayo", cycle: "W44", kind: "order", text, orderId, impact: impactOf(before, d) });
  };
  event(1048, "2026-10-29T09:40:00+01:00", "Order 1048 failed delivery · delivery fee lost, goods back on shelf", (b) => {
    const o = b.orders.find((x) => x.id === 1048)!;
    o.stage = "dispatched";
    o.failed = undefined;
    o.reversedCycle = undefined;
  });
  event(1050, "2026-10-29T14:15:00+01:00", "Order 1050 delivered · BLN-07 −1 on the shelf", (b) => {
    const o = b.orders.find((x) => x.id === 1050)!;
    o.stage = "dispatched";
    o.deliveredCycle = undefined;
    b.products.find((p) => p.sku === o.sku)!.onHand += o.qty;
  });
  return d;
}

