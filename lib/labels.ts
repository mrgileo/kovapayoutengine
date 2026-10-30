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
  salesPay: "Sales pay",
  fixedSalary: "Fixed salary",
  adSpend: "Meta ad spend",
  deliveryFees: "Delivery fees",
  teamBonus: "Team bonus",
  payAsPctOfSales: "Pay as % of sales",
  salesPerAdNaira: "Sales per ₦1 of ads",
  bookedSalesPerAdNaira: "Booked sales per ₦1 of ads",
  deliveredSalesPerAdNaira: "Delivered sales per ₦1 of ads",

  // Customer money vs staff money are different things
  payTakenBack: "Pay taken back",
  payTakenBackNextWeek: "Pay to be taken back next week",
  payKeptOnReturns: "Pay kept on returned orders",

  // Plain-language sentences used in several places
  perNaira: (n: number) => `₦${n.toFixed(2)}`,
  deliveryFeeNote: (fee: number) => `₦${fee.toLocaleString()} per delivery trip`,
  headline: (ratio: string) => `Sales pay is a healthy ${ratio} of sales, yet the business is`,
  headlineBody: {
    intro: "A basic sales report shows sales minus sales pay and calls the week profitable. Once you also take off",
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
  commission: { label: "− Sales pay", sub: "After pay taken back" },
  base: { label: "− Fixed salary", sub: "Sales staff, one week's share" },
  adSpend: { label: "− Meta ad spend", sub: "Prospecting + Retargeting" },
  logistics: { label: "− Delivery fees", sub: "Delivery, failed and return trips" },
  actual: { label: "= Real profit", sub: "After product, pay, ads and delivery" },
} as const;

/** The pay rules: labels, option labels and a one-line plain explanation for each. */
export const RULE_TEXT = {
  creditOn: {
    label: "Pay staff when...",
    options: { lead: "Lead", delivered: "Delivery", cash: "Cash in" },
    explain: {
      lead: (total: string) => `Staff earn ${total} the moment an order is booked, even if it never arrives.`,
      delivered: (total: string, closer: string, buyer: string, lead: string) =>
        `Staff earn ${total} once the courier delivers. Closer ${closer} · media buyer ${buyer} · team bonus ${lead}.`,
      cash: (total: string) => `Staff earn ${total} only after the courier hands over the cash. Nothing is paid on money still on a bike.`,
    },
  },
  onReturn: {
    label: "Pay taken back",
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
  discountFloor: {
    label: "Discount floor",
    options: { "0.05": "5%", "0.1": "10%", "0.15": "15%" },
    explain: (floor: number) =>
      `Pay is always worked out on the price the customer paid. Discount more than ${floor}% and the closer's rate halves on that order.`,
  },
  returnCap: {
    label: "Return-rate gate",
    options: { "1": "Off", "0.3": "30% cap", "0.2": "20% cap" },
    explain: {
      off: "No penalty for returns. A closer keeps the full rate even when 35% or more of their deliveries come back.",
      on: (cap: number) => `If more than ${cap}% of a closer's orders come back, their sales pay is halved for the week.`,
    },
  },
  payModel: {
    label: "Pay structure",
    options: { commission: "Sales pay only", base_plus: "Salary + sales pay" },
    explain: {
      commission: "Staff earn sales pay only. It costs less in a bad week, but it rewards volume over quality.",
      base_plus: "Closers, media buyers and the team lead get a fixed salary (one week's share each week) plus sales pay on top.",
    },
  },
} as const;

/** Words for the stage of a pay line in drills and payslips. */
export const PAY_LINE_TEXT = {
  base: "Fixed salary (one week's share)",
  commission: (orderId: number | undefined) => `Order #${orderId}`,
  adjustment: (kind: string) => (kind === "clawback" ? "Pay taken back" : kind === "offset" ? "Pay taken back (next week)" : kind === "carry" ? "Carried over" : `Adjustment (${kind})`),
  salary: "Fixed salary",
  salesPay: "Sales pay",
  takenBackCarry: "Pay taken back / carried over",
} as const;
