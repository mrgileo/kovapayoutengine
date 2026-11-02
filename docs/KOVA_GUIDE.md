# Kova Payout Engine: the everyday guide

Who this is for: anyone who needs to explain Kova to an e-commerce founder, whether in a post, a call or a video. It says what the app does, which founder problem each part solves, and how the parts connect. The technical spec is `docs/KOVA_SPEC.md`; this guide is the plain-English version.

> **All numbers in this guide come from the built-in demo company (week "W44").** They are demo data, not customer results. Say so whenever you quote them.

---

## 1. The one-paragraph pitch

Most COD and phone-sales businesses run on five disconnected things: the sales sheet, the ad dashboard, the courier's cash, the stock sheet and the payroll spreadsheet. Each says something different, and none says whether the business actually made money. Kova puts one order's whole journey in one place (booked, confirmed, sent, delivered, cash received, staff paid, stock reduced) and shows every naira of it, so nothing is missed and nothing is left out. The founder sees the truth; each staff member sees only their part.

**The sentence to remember:** *"Your sales sheet shows ₦497,888 this week. After product cost, ads, salaries and courier fees, the real figure was a loss of ₦152,420."* (demo week)

## 2. Who it is for

- **Founders and CEOs of COD / phone-confirmed e-commerce brands**, especially in Nigeria and similar markets, who run a media-buying team, a sales-closing team, an accountant and a warehouse.
- **Vendors and operators** who pay commission to closers and media buyers and are not sure the structure is working.
- **Outside Nigeria (for example the UK):** brands with phone or WhatsApp sales teams, high return rates, ad-funded growth, or commission-paid staff. See section 10 for what does and doesn't carry over.

## 3. The gaps it fills (problem, then answer)

Use this table as the source for posts. Left: what the founder lives with. Right: what Kova shows.

| # | The founder's problem | What Kova does about it | Where in the app |
|---|---|---|---|
| 1 | **The sales report flatters the business.** Revenue minus commission looks great; ads, product cost, courier fees and salaries are somewhere else. | Three profit figures side by side: what the sales report says (+₦497,888), left after product and ads (−₦5,613), and what you really made (−₦152,420). Eight cost lines, each opening the orders behind it. | Founder view: headline banner and "Where the money went" |
| 2 | **Staff are paid on orders that never land.** Pay on "lead" or "booked" means closers and buyers are rewarded for orders that get cancelled or returned. | One rule, "Pay staff when": on lead, on delivery, or on cash received. The app shows how much is being paid on undelivered orders (₦0 on delivery; ₦34,210 on lead in the demo). | Pay rules strip; "Paid on undelivered orders" tile |
| 3 | **A return three weeks later starts an argument.** The commission was already paid. Do you take it back, wait, or eat it? | One rule, "Pay taken back": take back now, take back next week, or business absorbs. The week's payout shows exactly what was taken back and from whom. Locked weeks are never touched. | Pay rules strip; returns on the order ledger; payslips |
| 4 | **Two people touch one order and both want the credit.** Opener versus closer. | One rule, "Two closers, one order": first touch, last touch, or 50-50. Order #1053 in the demo shows all three. | Pay rules strip; team lead's "split-credit orders" |
| 5 | **Pay structure is guesswork.** Is salary plus commission sustainable? | "Pay structure" switches between salary plus commission and commission only, with the pay-as-%-of-sales meter against a ceiling (35% or 10%). | Pay rules strip; pay meter |
| 6 | **High-return closers cost you money and nobody sees it.** | "Return-rate gate": above a 30% or 20% return rate, a closer's commission is halved for the week. A scorecard shows return rate and net margin contribution per closer. | Pay rules strip; closer scorecard |
| 7 | **You can't test a rule before you change it.** | Every option on every rule shows what the payout would be under that option, on your own numbers, before you click. | Pay rules strip (small figure under each option) |
| 8 | **Media buyers celebrate booked sales, not delivered sales.** "₦6.81 back per ₦1 of ads" is really ₦1.09 once only delivered orders count. | Ad results shown on booked and on delivered orders side by side, cost per delivered order against a limit you set, and profit per order before and after staff pay. | Media buyer view; Ad cost card |
| 9 | **Courier cash goes missing in the gap.** Delivered, but the money is still with the rider. | A "cash with courier" figure everywhere it matters, an accountant desk to record cash received by week and by city, and an Overdue flag after a week. | Founder tiles; Accountant view |
| 10 | **Stock-outs surprise you.** Orders get confirmed for product you don't have. | Stock book with on hand, committed, available and on order. A stock-out raises a purchase order in one click; receiving it unblocks the waiting orders. Orders blocked by stock show up in the leaks panel. | Warehouse view; stock book; leaks panel |
| 11 | **Nobody knows where the money is stuck.** | Leads first (29 came in, 13 became orders, 12 lost), then a funnel (booked, confirmed, sent out, delivered, delivered and kept, cash received) with the money at each step and the reason for each drop. Beside it, a leaks panel of six checks, each with a ₦ figure and what to do. | Founder view, top |
| 12 | **Payroll day is messy and risky.** One person calculates, approves, pays and records. | Pay is closed and approved by the founder, then paid and locked by the accountant, with a bank-ready payout file. Negative balances are never paid; they carry into next week. Everything is in an audit log by name and time. | Cycle bar; Accountant view; audit log |
| 13 | **Staff don't trust the numbers or can't see their own.** | Each person sees their own pay accrue as orders are delivered, with a plain breakdown (salary, commission, pay taken back). | Closer, buyer and team lead views |
| 14 | **Roles blur.** The person who sells also marks things delivered. | A closer can't mark their own order delivered. Only the founder approves pay. Only the warehouse and founder process returns. The accountant can't touch orders, prices or rules. | Order actions in every view |

## 4. How it all connects (the story to tell in the video)

Follow one order and show that nothing is retyped:

1. **A closer confirms an order** at the company price. Stock is *committed* straight away; if there isn't enough, the order shows as blocked and appears in the leaks panel.
2. **The warehouse dispatches it,** then the delivery is confirmed. This is the moment *revenue is recognised* and the closer's and buyer's pay starts accruing (under the "Pay staff when: delivery" rule). Stock on hand drops, and a courier delivery fee is counted.
3. **Cash:** until the courier hands the money over, the order counts as *cash still with courier*. The accountant records it; the funnel's last step and the cash tile update.
4. **A return** reverses everything in one go: revenue refunded, stock put back (or written off if damaged), staff pay taken back according to your rule.
5. **The week closes.** The founder approves; the accountant pays and locks. The profit, funnel, leaks and each person's payslip all come from the same orders, so they always add up.

Key point for the audience: **every figure opens the orders behind it.** The founder can click any number and see why it is that number.

## 5. The six people (and what each sees)

| Person (demo) | Role | What they get | What they can't do |
|---|---|---|---|
| Chidinma | Founder / CEO | Everything: profit, funnel, leaks, rules, prices, ad budget, stock, audit log. Approves pay. | n/a |
| Amaka | Closer (phone-first, works at 390px wide) | Her open pipeline, her return rate, her pay accruing, order cards | Change prices, mark her own order delivered, edit rules |
| Tobi | Media buyer | His ad spend, delivered versus booked results, cost per delivered order, his pay | Touch orders or rules |
| Ngozi | Team lead | Team delivered sales, team bonus, closer scorecard | Process returns |
| Bisi | Accountant | Courier cash desk, payout desk, bank file, mark paid, lock | Orders, prices, rules, approving pay |
| Dayo | Warehouse | Stock book, purchase orders, receiving, returns inspection | Cash, pay |

A **live activity strip** at the top shows each person what changed for them as things happen. When a delivery is confirmed, the closer sees their pay move and the founder sees revenue and profit move.

## 6. Feature tour by area

**Founder view**
- Headline: three profit figures and pay as a percentage of sales.
- Funnel ("where every order is") and leaks panel (seven checks, no fake grand total).
- KPI tiles: delivered revenue, cash with couriers, paid on undelivered orders, pay kept on returns, Products to reorder.
- "Where the money went": eight lines from delivered revenue down to real profit.
- Closer scorecard, ad budget (profit per order, max cost per order), price book, order ledger, stock book, audit log.

**Pay rules (five, founder-only):** pay staff when; pay taken back; two closers one order; pay structure; return-rate gate. Everyone else sees them locked, with who changed them and when.

**Weeks and pay:** open week accrues live; the founder closes and approves; the accountant exports the bank file, marks paid and locks. Negative payslips are never paid and carry forward.

**Stock:** per-SKU on hand, committed, available, on order, projected; one-click purchase orders; receiving unblocks orders; returned goods go back to stock if resellable, to write-off if damaged.

**Prices:** one company price per product. An order keeps the price it was created at, so changing a price only affects new orders and history never moves. There are no discounts to leak margin.

**Currency and theme:** naira, dollar and pound display toggle (fixed demo rates); light by default, dark available.

**Try it with your orders:** upload an orders CSV (optionally ad spend and products). Closer names can be anyone's: they are created from your file, so nothing has to be renamed. Weeks are worked out from your dates and replayed through the same engine. The data never leaves the browser. "Back to demo data" resets.

**Take the tour:** a six-step guided tour that *acts*. It resets the demo, then delivers an order as the warehouse and switches to the closer so her pay visibly moves, flips the pay rule to "Order booked" and quotes what that costs, returns an order paid last week, raises purchase orders, and hands the approved week to the accountant. Each step outlines the result and says in one or two sentences what just happened. It is the quickest way for a prospect to see how everything connects without you narrating, and a good basis for a 60-second clip. Reload the page (or Reset demo state) to run it again from the start.

### Words the app uses for pay

| Word on screen | What it means |
|---|---|
| **Fixed salary** | The weekly share of each person's monthly base pay. Paid whatever they sell. |
| **Commission paid** | The variable part, earned on delivered orders (closer 4%, media buyer 1.5%, team bonus 1% in the demo). It does **not** include fixed salary. |
| **Staff pay / Net payout** | Fixed salary + commission, less any pay taken back. |
| **Pay taken back** | Commission that is taken off a payout because the order was returned. |

## 7. The five rules as founder questions (post and video material)

1. *Pay staff when?* Order booked, delivered, or cash received. Delivered is the default. The demo shows what the rule costs you in pay on undelivered orders.
2. *A return comes back after pay was sent. Who carries it?* Take back now, take back next week, or business absorbs. The app shows the exact amount and the person, and a locked week is never reopened.
3. *Two people on one order?* First touch, last touch, or 50-50, with a live order (#1053) to try it on.
4. *Salary plus commission, or commission only?* The pay meter shows the share of sales going to people against a ceiling.
5. *When does a closer's return rate cost them?* The gate halves their commission above your limit.

Honest framing for posts: Kova doesn't tell a founder which option is right. It shows what each one costs them on their own numbers, so they can choose with eyes open.

## 8. Numbers you can quote (demo week W44, labelled as demo)

| Figure | Value |
|---|---|
| Delivered revenue | ₦532,500 |
| Product cost | ₦222,500 |
| Commission paid (6.5% of sales when staff are paid on delivery) | ₦34,613 |
| Fixed salary (weekly share) | ₦122,307 |
| Ad spend (simulated feed) | ₦281,000 |
| Delivery fees (7 legs × ₦3,500) | ₦24,500 |
| **What you really made** | **−₦152,420** |
| What the sales report says | +₦497,888 |
| Cash still with couriers | ₦185,500 (2 orders) |
| Paid on undelivered orders: paid on delivery / paid on booking | ₦0 / ₦34,210 |
| Pay rate: paid on delivery / paid on booking | 6.5% / 2.75% of sales |
| Ads: sales per ₦1 on booked orders vs delivered | ₦6.81 vs ₦1.09 (one buyer) |
| Profit per order, before / after staff pay | +₦5,800 / −₦25,584 |
| Stock on hand at cost | ₦1,419,000 |
| Example clawback (return on a W43 order) | ₦13,780 of commission taken back |

## 9. What Kova is not (say this, it builds trust)

- It is a **demo and decision tool**, not (yet) a live integration. The Meta ad figures are a *simulated feed*, clearly labelled. There is no connection to Shopify, couriers or banks.
- There is **no backend**. Everything lives in the visitor's browser. Their imported data is never uploaded, and clearing the browser clears it.
- The demo week is a **deliberate stress test**: ad spend is about 53% of sales, heavier than most businesses run, so every leak shows at once. Say so before a founder says "my business doesn't look like that". The app says it too, in a note under the headline.
- Pay rates (4% closer, 1.5% buyer, 1% team lead) and the 3,500 delivery fee are demo settings.
- It has **no part-payments**. An order is paid in full on delivery or it is not delivered.
- It has **no repeat-customer tracking**. Repeat buyers usually call or message on WhatsApp, and that happens outside the product. Every order is entered as a new order.
- It has **no per-courier or per-city delivery success rate** and **no variable delivery fees** (the delivery fee is one flat demo setting). Do not promise these; say they are not built.
- Leads are **seeded, not live**. The demo shows form fills, WhatsApp, calls and Instagram, how many became orders and what the lost ones were worth, but there is no connection to a WordPress form or any inbox. Do not claim one.
- The waitlist is a Tally form embedded in the page. The email goes to Tally; nothing from the demo or loaded orders leaves the browser.
- It doesn't prove which rule is best. It shows the cost of each on the numbers in front of you.

## 10. Nigeria versus the UK: what carries over

- **Carries over directly:** the sales-report-versus-real-profit gap, ad results on delivered versus booked orders, returns and clawbacks, commission design, double-touch orders, stock-outs, the audit trail and separation of duties.
- **Nigeria-specific:** cash on delivery, courier cash that is still in the rider's bag, and the "cash in" pay rule. These are the sharpest hooks for Nigerian founders.
- **For UK brands, be careful:** most UK sales are prepaid, so the courier-cash story won't land. Lead with returns (usually higher), ad cost versus profit, and commission design for phone or WhatsApp sales teams. The pound view is a display conversion at a fixed demo rate (£1 = ₦1,900), not real UK data: no VAT, no card fees, no UK carriers.

## 11. Hook bank (each ties to something you can show in under 30 seconds)

- *"Your sales report and your bank account disagree. Here's where the difference goes."* Headline banner, then click through "Where the money went."
- *"A closer's commission is paid the moment an order is booked. Here's what that costs in a week."* Switch "Pay staff when" from Delivered to Order booked. Show paid-on-undelivered going from ₦0 to ₦34,210.
- *"A return three weeks later: clawback now, offset, or absorb."* Return order #1033 on three settings. Show the amount taken back each time.
- *"Two people on one order."* Order #1053 under first touch, last touch, 50-50.
- *"Your media buyer says ₦6.81 back per ₦1. The delivered number is ₦1.09."* Media buyer view.
- *"Where is my money stuck?"* The funnel and leaks panel. ₦185,500 is sitting with couriers.
- *"A stock-out should raise a purchase order, not a surprise."* Warehouse alert, one click, stock loop closed.
- *"Who approves pay should never be who pays it."* Founder approves, accountant pays, both in the log.

## 12. Links that open a specific view

Every post can link to the exact moment it talks about. Add these to the demo address (`https://kovadash.vercel.app/`):

| Parameter | Values |
|---|---|
| `role` | `founder`, `closer`, `buyer`, `lead`, `accountant`, `stock` |
| `creditOn` (Pay staff when) | `lead` (Order booked), `delivered` (Delivered), `cash` (Cash received) |
| `onReturn` (Pay taken back) | `clawback`, `offset`, `absorb` |
| `split` (Two closers, one order) | `first`, `last`, `half` |
| `payModel` (Pay structure) | `base_plus`, `commission` |
| `returnCap` (Return-rate gate) | `1` (off), `0.3`, `0.2` |

Examples:
- Pay on booking, founder view: `/?role=founder&creditOn=lead`
- Split on an order, team lead view: `/?role=lead&split=half`
- The accountant's cash desk: `/?role=accountant`

Rules to know: a link that sets rules **starts from the fresh demo company** so the viewer sees what your post showed (it never overwrites data a visitor has imported; for them only the persona changes). Unknown values are ignored. The address bar is tidied after the link opens. The command palette (Ctrl+K) has **Copy a link to this view**, which builds the link for whatever persona and rules you have on screen.

Link previews: pasting the address into WhatsApp, LinkedIn or X shows a card with the "sales report versus what you really made" headline and "Demo data".

## 13. Loom run-down: suggested order (8–10 minutes)

*Short on time? Open the demo, click **Take the tour**, and talk over it: it covers steps 1 and 3 to 7 below in about a minute and a half.*


1. The question: "does my business actually make money?" Headline banner (1 min).
2. Where every order is: funnel and leaks (1 min).
3. One delivery end to end: switch to the warehouse, confirm delivery, watch the closer's pay and the founder's revenue move (2 min).
4. The five rules: change one, watch the payout change (2 min).
5. A return after payout (1 min).
6. Stock-out to purchase order (1 min).
7. Week close: founder approves, accountant pays and locks (1 min).
8. Try it with your own orders (1 min), then the call to action: **Join the waitlist** (button in the page header). Say it plainly: "Leave your email and I will tell you when it is ready for your own orders."
