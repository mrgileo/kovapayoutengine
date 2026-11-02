// Domain model for the Kova payout engine.
// Everything the UI shows is derived from these records by lib/engine.ts.

export type Stage = "new" | "confirmed" | "dispatched" | "delivered" | "returned" | "cancelled";

export type Role = "closer" | "buyer" | "lead" | "stock" | "founder" | "accountant";

/** When a sale earns commission. */
export type CreditOn = "lead" | "delivered" | "cash";
/** What happens to commission when an already-credited order comes back. */
export type OnReturn = "clawback" | "offset" | "absorb";
/** Who gets closer credit when one person opened the order and another closed it. */
export type SplitRule = "first" | "last" | "half";
/** Whether sales staff carry a fixed base on top of commission. */
export type PayModel = "commission" | "base_plus";

export interface Rules {
  creditOn: CreditOn;
  onReturn: OnReturn;
  split: SplitRule;
  /** Return rate above this fraction halves the closer's variable commission on the cycle. */
  returnCap: number;
  payModel: PayModel;
}
export type RuleKey = keyof Rules;

export interface Stamp {
  by: string; // person id
  at: string; // ISO timestamp
}

export interface Person {
  id: string;
  name: string;
  role: Role;
  title: string;
  /** Monthly base in naira. Pro-rated into each weekly cycle. */
  monthlyBase: number;
  reportsTo?: string;
}

export interface Product {
  sku: string;
  name: string;
  onHand: number;
  reorder: number;
  cost: number;
  /** Company selling price per unit. Set by the founder; closers cannot change it. */
  price: number;
  leadDays: number;
}

export interface Order {
  id: number;
  customer: string;
  city: string;
  sku: string;
  qty: number;
  /** Company unit price when the order was created. A later price change only affects new orders. */
  unitPrice: number;
  /** First touch: who opened the conversation. */
  openedBy: string;
  /** Last touch: who closed the sale. */
  closer: string;
  buyer: string;
  /** Optional free-text label. Any media buyer can run any campaign. */
  campaign?: string;
  stage: Stage;
  /** Courier has remitted the cash (COD). */
  cashIn: boolean;
  /** Cancelled after dispatch = a failed delivery attempt. */
  failed?: boolean;
  returnCondition?: "resellable" | "damaged";

  createdCycle: string;
  deliveredCycle?: string;
  reversedCycle?: string; // cycle in which it was returned / cancelled

  /** Cycle whose payout already includes this order's commission. */
  creditedCycle?: string;
  /** Terminal and settled in a closed cycle without commission. */
  closedOut?: boolean;
}

export type LineKind = "base" | "commission" | "clawback" | "offset" | "carry";

export interface PayLine {
  key: string;
  personId: string;
  kind: LineKind;
  orderId?: number;
  amount: number;
  note: string;
}

export type CycleStatus = "open" | "approved" | "paid" | "locked";

export interface Cycle {
  id: string; // e.g. W44
  start: string; // ISO date
  end: string;
  status: CycleStatus;
  /** Lines carried in from the previous close (offsets, negative balances). */
  carryIn: PayLine[];
  /** Frozen on close. */
  lines?: PayLine[];
  pnl?: PnL;
  closedAt?: string;
  closedBy?: string;
  paidAt?: string;
  paidBy?: string;
  lockedAt?: string;
  lockedBy?: string;
}

export interface PurchaseOrder {
  id: string;
  sku: string;
  qty: number;
  unitCost: number;
  raisedAt: string;
  raisedBy: string;
  eta: string;
  status: "open" | "received";
  receivedAt?: string;
}

/** What an event did to the rest of the company. Computed by diffing the state before and after. */
export interface Impact {
  /** Change in each person's pay this week. */
  pay: { personId: string; amount: number }[];
  /** Change in delivered revenue. */
  revenue?: number;
  /** Change in real profit. */
  profit?: number;
  /** Change in cash still with the courier (up is bad). */
  stuckCash?: number;
  /** Units on hand and units free to promise, where either moved. */
  stock: { sku: string; onHand: [number, number]; available: [number, number] }[];
}

export interface AuditEntry {
  id: number;
  at: string;
  actor: string;
  cycle: string;
  kind: "order" | "rule" | "cycle" | "stock" | "system";
  text: string;
  /** Money movements caused by this event, stored in naira and formatted at render. */
  deltas?: { label: string; amount: number }[];
  /** Who and what this event moved. Present on order, stock and rule events recorded after this was added. */
  impact?: Impact;
  /** The order this event is about, so the order table can say "Confirmed by Amaka". */
  orderId?: number;
}

/** Where an enquiry came from. Most arrive as form fills from the landing page. */
export type LeadSource = "web_form" | "whatsapp" | "call" | "instagram";

/** An enquiry before it is an order. Leads never reserve stock or earn pay; only a booked order does. */
export interface Lead {
  id: number;
  cycle: string;
  customer: string;
  city: string;
  source: LeadSource;
  /** Optional free-text label, the same idea as Order.campaign. */
  campaign?: string;
  /** open = not reached yet; booked = became the order in orderId; lost = never became an order. */
  status: "open" | "booked" | "lost";
  /** Why a lost lead was lost. */
  reason?: string;
  orderId?: number;
}

export interface DemoState {
  version: number;
  people: Person[];
  products: Product[];
  orders: Order[];
  /** Leads that came in before orders; empty on imported data. */
  leads: Lead[];
  cycles: Cycle[];
  rules: Rules;
  rulesMeta: Record<RuleKey, Stamp>;
  /** cycle id -> buyer id -> ad spend (simulated Meta feed in this demo) */
  spend: Record<string, Record<string, number>>;
  /** Ad spend per delivered order above which a media buyer is flagged. Founder-set; never affects pay. */
  maxCostPerOrder: number;
  pos: PurchaseOrder[];
  audit: AuditEntry[];
  seq: number;
}

/** One row in a drill-down: the evidence behind a figure. */
export interface DrillLine {
  ref: string;
  label: string;
  detail?: string;
  amount: number;
}

export interface Drill {
  title: string;
  subtitle?: string;
  lines: DrillLine[];
  total: number;
}

export interface PnL {
  cycleId: string;
  revenue: number;
  refunds: number;
  cogs: number;
  writeoffs: number;
  commission: number;
  base: number;
  adSpend: number;
  logistics: number;
  actual: number;
  payout: number;
  payoutRatio: number;
  commissionRatio: number;
  drills: Record<PnLKey, Drill>;
}

export type PnLKey =
  | "revenue"
  | "refunds"
  | "cogs"
  | "writeoffs"
  | "commission"
  | "base"
  | "adSpend"
  | "logistics"
  | "actual";
