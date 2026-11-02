// Single source of display text. Internal keys (creditOn, onReturn, pnl.actual, ...) never change;
// only the words people read do. Pure strings, no imports, so the engine and the UI can both use it.

export const L = {
  // Three ways to read the week
  salesReport: "What your sales report says",
  afterProductAndAds: "Left after product and ads",
  realProfit: "Real profit",

  // P&L lines
  revenue: "Delivered revenue",
  refunds: "Refunds",
  productCost: "Product cost",
  damagedStock: "Damaged stock",
  salesPay: "Commission paid",
  cashWithCourier: "Cash with courier",
  fixedSalary: "Fixed salary",
  adSpend: "Meta ad spend",
  deliveryFees: "Delivery fees",
  teamBonus: "Team bonus",
  payAsPctOfSales: "Pay as % of sales",
  salesPerAdNaira: "Sales per ₦1 of ads",
  bookedSalesPerAdNaira: "Booked sales per ₦1 of ads",
  deliveredSalesPerAdNaira: "Delivered sales per ₦1 of ads",

  profitPerOrder: "Profit per order",
  profitPerOrderBeforePay: "Profit per order, before staff pay",
  profitPerOrderAfterPay: "Profit per order, after staff pay",
  maxCostPerOrder: "Max Cost Per Lead",
  costPerOrder: "Ad cost per delivered order",
  simulatedFeed: "Simulated Meta feed",
  simulatedFeedNote: "What are you paying for orders and how much are you keeping?",

  // Where an order is, in words a person would use
  stage: { new: "Not confirmed yet", confirmed: "Confirmed", dispatched: "Sent out", delivered: "Delivered", returned: "Returned", cancelled: "Cancelled" } as Record<string, string>,

  // Revenue flow (funnel) and leaks
  flowDropWaitingConfirm: "Waiting to be confirmed",
  flowDropCancelled: "Cancelled before shipping",
  flowDropWaitingDispatch: "Confirmed, waiting for the warehouse",
  flowDropOnTheRoad: "Out for delivery",
  flowDropFailed: "Failed deliveries",
  flowDropReturned: "Returned by the customer",
  flowDropCashWithCourier: "Delivered, cash still with the courier",
  flowStepLabel: {
    booked: "Booked",
    confirmed: "Confirmed",
    dispatched: "Sent out",
    delivered: "Delivered",
    kept: "Delivered and kept",
    cash: "Cash received",
  },
  leadSource: { web_form: "Website form", whatsapp: "WhatsApp", call: "Phone call", instagram: "Instagram" } as Record<string, string>,
  lostLeadsDrill: "Leads that never became orders",
  lostLeadsSub: (cycle: string, avg: number) => `Lost Leads in ${cycle}, each priced at this week's average order of ₦${avg.toLocaleString()}`,
  leadsLine: (leads: number, booked: number, rate: number) => `${leads} Leads came in this week and ${booked} became orders (${Math.round(rate * 100)}%).`,
  // What each row counts, in words. Rows are cumulative: an order that is already delivered still counts as "confirmed" and "sent out".
  flowRowSub: (key: string, n: number, booked: number) => {
    const o = (x: number) => `${x} order${x === 1 ? "" : "s"}`;
    if (key === "booked") return `${o(n)} booked this week`;
    const what: Record<string, string> = {
      confirmed: "have been confirmed",
      dispatched: "have been sent out",
      delivered: "have reached the customer",
      kept: "reached the customer and were not returned",
      cash: "have had their cash received",
    };
    return `${n} of ${booked} orders ${what[key] ?? "got this far"}`;
  },
  flowIntro: "",
  flowStepHint: {
    booked: "been booked",
    confirmed: "been confirmed or gone further",
    dispatched: "been sent out or gone further",
    delivered: "reached the customer",
    kept: "reached the customer and not been returned",
    cash: "reached the customer, been kept, and had the cash received",
  },
  leak: {
    cash: { label: "Cash still with the courier", why: "Delivered, but the courier hasn't handed over the money.", action: "Chase the courier, then mark the cash received." },
    blocked: { label: "Orders waiting on stock", why: "Booked, but there is not enough stock to confirm them.", action: "Raise a purchase order for that product." },
    returns: { label: "Returns and failed deliveries", why: "Courier fees, damaged stock and refunds on orders that came back or failed.", action: "Check which closer and which product the returns come from." },
    ads: { label: "Ad spend above your max", why: "Ad spend beyond your max cost per delivered order.", action: "Pause or fix the campaigns that cost the most per delivered order." },
    payEarly: { label: "Commission before delivery", why: "Commission going out on orders that haven't reached the customer.", action: "Pay on delivery or on cash received instead." },
    lostLeads: { label: "Leads that never became orders", why: "People who asked to buy but were never booked as an order, so no sale was made.", action: "Call new form fills within the hour and note why each one is lost." },
    payKept: { label: "Pay kept on returned orders", why: "Staff kept their pay on orders that came back and the business took the loss.", action: "Set Customer refunded to Take back now." },
  },

  // Customer money vs staff money are different things
  payTakenBack: "Customer refunded",
  payTakenBackNextWeek: "Customer refunds to take off next week",
  payKeptOnReturns: "Pay kept on returned orders",

  // Plain-language sentences used in several places
  perNaira: (n: number) => `₦${n.toFixed(2)}`,
  deliveryFeeNote: (fee: number) => `₦${fee.toLocaleString()} per delivery trip`,
  guidedDemo: "Guided demo",
  /** One calm line under each role's page title. Pay rules are not shown to these roles; the founder tells them by email. */
  roleIntro: {
    founder: "",
    accountant: "Record courier cash, then pay and lock the week. Click any figure to see the orders behind it.",
    closer: "Your orders and what you have earned. You earn once the warehouse marks an order delivered.",
    buyer: "What you spent on ads each week, the orders those ads brought in, and what you earned.",
    lead: "Your team's delivered sales, each closer's returns, and what you earned.",
    stock: "Stock on the shelf, what to reorder, and the orders waiting for the warehouse.",
  } as Record<"founder" | "accountant" | "closer" | "buyer" | "lead" | "stock", string>,
  headline: "See what you actually keep after delivery.",
  headlineNet: (loss: boolean) => (loss ? "This week the business is losing" : "This week the business is netting"),
  cashEarned: "Cash you've earned",
  cashEarnedSub: "Sales delivered this week",
  cashReceived: "Cash you've received",
  cashReceivedSub: "Delivered this week and the money is in hand",
  cashGap: "Still with the couriers",
  cashGapSub: "Delivered this week, but the courier has not handed over the money",
  headlineBody: {
    intro: "A basic sales report shows sales minus commission and calls the week profitable. Once you also take off",
    productCost: "product cost",
    adSpend: "ad spend",
    fixedSalary: "fixed salaries",
    deliveryFees: "delivery fees",
    outro: "the real profit appears. Click any figure to see the orders behind it.",
  },
} as const;

/** Display text for the P&L waterfall rows and the plain-language subtitles. */
export const PNL_TEXT = {
  revenue: { label: "Delivered revenue", sub: (cycle: string) => `Orders delivered in ${cycle}` },
  refunds: { label: "− Refunds", sub: "Customer returns from earlier weeks" },
  cogs: { label: "− Product cost", sub: "What the delivered goods cost us" },
  writeoffs: { label: "− Damaged stock", sub: "Returned and can't be resold" },
  commission: { label: "− Commission paid", sub: "After customer refunds" },
  base: { label: "− Fixed salary", sub: "Sales staff, one week's share" },
  adSpend: { label: "− Meta ad spend", sub: "Simulated Meta feed" },
  logistics: { label: "− Delivery fees", sub: "Delivery, failed and return trips" },
  actual: { label: "= Real profit", sub: "After product, pay, ads and delivery" },
} as const;

/** The pay rules: labels, option labels and a one-line plain explanation for each. */
export const RULE_TEXT = {
  creditOn: {
    label: "Pay staff when...",
    options: { lead: "Order booked", delivered: "Delivered", cash: "Cash received" },
    explain: {
      lead: (total: string) => `Staff earn ${total} the moment an order is booked, even if it never arrives.`,
      delivered: (total: string, closer: string, buyer: string, lead: string) =>
        `Staff earn ${total} once the courier delivers. Closer ${closer} · media buyer ${buyer} · team bonus ${lead}.`,
      cash: (total: string) => `Staff earn ${total} only after the courier hands over the cash. Nothing is paid on money still on a bike.`,
    },
  },
  onReturn: {
    label: "Customer refunded",
    options: { clawback: "Take back now", offset: "Take back next week", absorb: "Business absorbs" },
    explain: {
      clawback: "If an order comes back after staff were paid, that pay comes off this week's payout. Pay not yet paid is simply cancelled.",
      offset: "If an order comes back after staff were paid, that pay comes off next week's payout, so nobody gets a surprise now.",
      absorb: "Staff keep the pay and the business takes the loss, so there is no reason for staff to be careful about returns.",
    },
  },
  split: {
    label: "Two closers, one order",
    options: { first: "First touch", last: "Last touch", half: "50-50" },
    explain: {
      first: "The person who opened the conversation gets the closer pay.",
      last: "The person who closed the sale gets the closer pay.",
      half: "The closer pay is split evenly between the person who opened it and the one who closed it.",
    },
  },
  returnCap: {
    label: "Return-rate gate",
    options: { "1": "Off", "0.3": "30% cap", "0.2": "20% cap" },
    explain: {
      off: "No penalty for returns. A closer keeps the full rate even when 35% or more of their deliveries come back.",
      on: (cap: number) => `If more than ${cap}% of a closer's orders come back, their commission is halved for the week.`,
    },
  },
  payModel: {
    label: "Pay structure",
    options: { commission: "Commission only", base_plus: "Salary + commission" },
    explain: {
      commission: "Staff earn commission only. It costs less in a bad week, but it rewards volume over quality.",
      base_plus: "Closers, media buyers and the team lead get a fixed salary (one week's share each week) plus commission on top.",
    },
  },
} as const;

/** Words for the stage of a pay line in drills and payslips. */
export const PAY_LINE_TEXT = {
  base: "Fixed salary (one week's share)",
  commission: (orderId: number | undefined) => `Order #${orderId}`,
  adjustment: (kind: string) => (kind === "clawback" ? "Customer refunded" : kind === "offset" ? "Customer refunded (next week)" : kind === "carry" ? "Carried over" : `Adjustment (${kind})`),
  salary: "Fixed salary",
  salesPay: "Commission paid",
  takenBackCarry: "Customer refunded / carried over",
} as const;
