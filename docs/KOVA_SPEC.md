**KOVA SUPPLY CO.**

**Kova Payout, P&L & Stock Engine — Complete Product Specification & User Guide**

*Comprehensive functional, financial, operational, and UI/UX specification of the Kova Payout Engine application. Written as a complete reference manual so any CEO, operator, engineer, or reviewer can navigate and audit every calculation, workflow, and screen without ambiguity.*

> **Core Executive Thesis —** In Cash-on-Delivery (COD) and high-velocity e-commerce, paying sales teams on raw order volume while tracking P&L in a separate spreadsheet creates an operational blind spot: payout ratios look healthy (6.5%) while the business is quietly losing money once Cost of Goods Sold (COGS), Meta ad spend, pro-rated base salaries, delivery fees, and customer returns are accounted for. Kova unifies Compensation, True Operating P&L, Courier Cash Remittance, and Warehouse Inventory into a single live engine.  
>   
> **Personal note:** we perhaps should think of how to fit in Meta ad spend into the whole calculation, so that Average Order Value is calculated: (Revenue − Cost of Product − Ad Spend = What you actually get). On a real build this would require connecting to meta-API, but it would be good to see a demo of this. Although it seems we already have that in the Full Operating Net figure. However, generally, I think it would be nice to make some terms slightly simpler for the everyday CEO – right now it feels like an accounting dashboard rather than a operating dashboard. Other phrases like media buyer prospecting, media buyer retargeting, because all media buyers can run all at the same time and it doesn’t matter which they run, just that they maintain a healthy CPC of N4000 max; also 1.0% override, what do all that mean as well? What does variable commission really consider? We can just call clawbacks refunds since that is what they are. No need to also worry about discounts, since they’ll be priced into the product final price for the customer (unless I am mistaken and they are actually needed). And changing that figure would simply change the overall kpi calculation and overall revenue and margins.

# **1. Application Overview & Navigation Architecture**

The Kova Payout Engine is a client-persisted Next.js 15 + React 19 + TypeScript application that simulates a multi-role Nigerian COD e-commerce operation (**Kova Supply Co.**) across three weekly payout cycles (**W42**, **W43**, and active cycle **W44**). Every action taken by any persona immediately recalculates company-wide P&L, staff payslips, warehouse stock reservations, and the immutable audit log.

## **1.1 Global Layout & Shell**

> **• Fixed & Collapsible Left Sidebar (\`.side\`):** Pinned to the left viewport edge (position: fixed; height: 100dvh) on desktop (\> 920px) so it never scrolls away when inspecting long tables. Defaults to 276px wide and collapses smoothly into a 72px compact icon rail via the header toggle button, the top-bar toggle button, or the keyboard shortcut Ctrl+B / ⌘B. In collapsed mode, persona avatars remain centered with hover tooltips and corner stock-alert badges.
>
> **• Sticky Top Utility Bar (\`.topbar\`):** Remains pinned at the top of the main workspace. Displays the pulsing yellow live indicator, active cycle badge (Cycle W44 · 26 Oct – 1 Nov), a live clickable **Net P&L** pill, the **Light Mode / Dark Mode** theme toggle button, and the **Quick Actions (\`⌘K\` / \`Ctrl+K\`)** Command Palette trigger.
>
> **• Directional View Transitions:** Switching between role personas animates the main workspace directionally (forwards sliding up when moving down the org chart, backwards sliding down when moving up) using the native browser document.startViewTransition() API with graceful fallback.
>
> **• Live Activity Strip (`ActivityStrip.tsx`):** A line pinned under the top bar on every tab. It shows the latest event (who did what, and when) and **who and what it moved, for the role you are viewing as**. Marking #1043 delivered shows, to the founder: *Amaka +₦8,480 · Tobi +₦3,180 · Ngozi +₦2,120 · Delivered revenue +₦212,000 · Real profit +₦116,720 · Cash with courier +₦212,000 · AIR-12 on hand 4 → 3*. The same event shows a closer only *You +₦8,480* and the stock move, a media buyer only *You +₦3,180*, the team lead themself and their own closers, and the warehouse only the stock move. Company revenue, profit and courier cash are founder-only. Every chip carries a +/− sign, so colour is never the only signal; the viewer's own chip is outlined. New events flash the strip briefly and an **Earlier** button opens the last five. On a phone only the top bar stays pinned; the strip scrolls with the page. Before any event it says what to try.
>
> **• 60-Second CEO Tour Card:** Clicking **60-sec CEO tour** in the page header (or **CEO demo walkthrough** in the sidebar) opens an interactive 6-step executive walkthrough explaining the exact moments to test during a live demonstration.

## **1.2 Light-by-Default Theme (Light & Dark)**

The interface is built around a high-contrast **Yellow + Carbon Black + Crisp White** palette that supports both **Light Mode** and **Dark Mode** (switched by one `data-theme` attribute on the page root, with CSS light-dark() tokens). **The app opens in Light Mode by default and never follows the browser or operating-system setting.** The toggle in the top bar (or the command palette) switches to Dark Mode, and only that explicit choice is saved in localStorage under kova-color-scheme:

| **Semantic Token**                       | **Dark Mode Value**                         | **Light Mode Value**                            | **Where It Is Used**                                                                                      |
|------------------------------------------|---------------------------------------------|-------------------------------------------------|-----------------------------------------------------------------------------------------------------------|
| **Primary Canvas & Cards**               | \#070709 canvas / \#111115 cards            | \#F6F6F2 canvas / \#FFFFFF cards                | Page background, data cards, tables, modals, and drawers.                                                 |
| **Primary Brand (Yellow)**               | \#FACC15 / \#EAB308 with \#070709 text      | \#FACC15 / \#EAB308 with \#070709 text          | Primary CTA buttons, active segmented-control thumb, active role bar, table resize indicator.             |
| **Highlights (Light Yellow)**            | \#FEF08A text / rgba(254,240,138,0.13) fill | \#713F12 text / \#FEF9C3 fill / \#FACC15 border | Row hover states, split-credit row highlights, figure hover states, warning pills.               |
| **Errors & Negative States (Light Red)** | \#FCA5A5 text / rgba(252,165,165,0.14) fill | \#B91C1C text / \#FEE2E2 fill / \#FCA5A5 border | Negative P&L figures, post-close pay taken back, stockout badges, high return-rate bars, danger buttons.       |
| **Progress & Positive (Dark Green)**     | \#14532D & \#166534 fill / \#86EFAC text    | \#14532D text & bars / rgba(20,83,45,0.11) fill | Cycle settlement progress steps, revenue waterfall bars, delivered pills, healthy return-rate indicators. |

## **1.3 Universal Interactive Primitives**

> **• Zero-Compression Drill-Down Figures (\`\<Fig /\>\`):** Every monetary figure backed by data is rendered as inline monospace typography with a subtle dashed underline (border-bottom: 1.5px dashed). Clicking **any** figure opens the **Audit Trail Drill-Down Drawer** on the right side of the screen, listing every contributing order, SKU, campaign, or staff line item that sums to that exact number.
>
> **• Live Number Tweening & Delta Flash:** When a rule or order changes, \<Fig /\> smoothly counts up or down over 320ms (requestAnimationFrame cubic ease-out) and pulses dark-green (data-flash="up") or light-red (data-flash="down").
>
> **• Adjustable Table Column Headers with Breaker Lines:** Every \<table class="tbl"\> renders a visible vertical breaker line on the right edge of each \<th /\>. Hovering near a breaker line glows **Electric Yellow (\`#FACC15\`)** with a col-resize (↔) cursor. Dragging left or right widens or narrows the column live; double-clicking any breaker line resets the table's column widths.
>
> **• Multi-Currency Display Switcher:** Located in the sidebar footer. Converts all displayed figures live between **NGN (\`₦\`, rate \`1:1\`)**, **USD (\`\$\`, \`₦1,600 = \$1\`)**, and **GBP (\`£\`, \`₦2,050 = £1\`)**.
>
> **• Automatic State Persistence:** All rule changes, order transitions, price changes, returns, purchase orders, and cycle closures persist automatically in localStorage under kova-payout-engine (with SEED_VERSION = 9). Clicking **Reset demo state** restores the clean factory seed.

## **1.4 Plain-Language Glossary (`lib/labels.ts`)**

All display text comes from `lib/labels.ts`. Internal keys such as `creditOn`, `onReturn` and `pnl.actual` never change; only the words on screen do.

| **On screen** | **Old / internal term** | **Meaning** |
|---|---|---|
| What your sales report says | Naive net | Sales minus sales pay. Ignores product cost and ads. |
| Left after product and ads | Core actual | Sales minus product cost, sales pay and ad spend. |
| Real profit | Full operating net (`pnl.actual`) | Everything the business pays out is taken off. |
| Sales pay | Variable commission | Closer, media buyer and team bonus earned on orders. |
| Fixed salary | Fixed base | The weekly share of each person's monthly base. |
| Team bonus | 1.0% override | What the team lead earns on the team's delivered sales. |
| Pay staff when... | Credit a sale on | The moment an order starts earning sales pay. |
| Pay as % of sales | Payout ratio | Fixed salary + sales pay as a share of delivered revenue. |
| Product cost | COGS | What the delivered goods cost the business. |
| Delivery fees | Courier legs | ₦3,500 per delivery, failed-delivery or return trip. |
| Damaged stock | Write-offs | Returned goods that cannot be resold. |
| Sales per ₦1 of ads | ROAS | Delivered (or booked) sales divided by ad spend. |
| Refunds | Customer returns | Money back to customers for earlier weeks' orders. |
| Pay taken back | Clawback / offset | Staff pay recovered when an order they were paid on comes back. Not the same thing as Refunds. |

# **2. Role Personas, Org Structure & Segregation of Duties**

A critical flaw in naive operations dashboards is giving every user 'God Mode.' In Kova, switching roles in the sidebar (via mouse click, ↑/↓/Home/End arrow keys, or ⌘K) changes both **what you see** and **what you are permitted to do**.

## **2.1 Company Staff Directory & Base Compensation**

| **ID**   | **Full Name**      | **Role Tab** | **Title & Scope**               | **Monthly Base** | **Weekly Pro-Rata Base** |
|----------|--------------------|--------------|---------------------------------|------------------|--------------------------|
| chidinma | **Chidinma Okoro** | founder      | Founder & CEO                   | ₦0               | ₦0 (Owner equity)        |
| amaka    | **Amaka Obi**      | closer       | Sales Closer (Reports to Ngozi) | ₦70,000          | ₦16,154 / wk             |
| chidi    | **Chidi Nwosu**    | closer       | Sales Closer (Reports to Ngozi) | ₦70,000          | ₦16,154 / wk             |
| tobi     | **Tobi Ade**       | buyer        | Media Buyer                     | ₦120,000         | ₦27,692 / wk             |
| zainab   | **Zainab Bello**   | buyer        | Media Buyer                     | ₦120,000         | ₦27,692 / wk             |
| ngozi    | **Ngozi Eze**      | lead         | Sales Team Lead (1.0% team bonus) | ₦150,000         | ₦34,615 / wk             |
| bisi     | **Bisi Adeyemi**   | accountant   | Accountant · Finance            | ₦0               | ₦0 (Finance payroll)     |
| dayo     | **Dayo Aremu**     | stock        | Inventory · Lagos Warehouse     | ₦0               | ₦0 (Ops payroll)         |

**Weekly Pro-Rata Formula:** weeklyBase = Math.round((monthlyBase \* 12) / 52). Across the 5 sales staff members (Amaka, Chidi, Tobi, Zainab, Ngozi), total weekly fixed base pay under the Base + variable model is ₦16,154 + ₦16,154 + ₦27,692 + ₦27,692 + ₦34,615 = ₦122,307.

## **2.2 Strict Segregation of Duties Matrix**

To prevent commission fraud (such as a closer marking their own order 'Delivered' to trigger a payout before goods leave the warehouse), Kova enforces strict role-based permissions:

| **Operation / Action** | **Founder (Chidinma)** | **Closer (Amaka)** | **Media Buyer (Tobi)** | **Team Lead (Ngozi)** | **Accountant (Bisi)** | **Inventory (Dayo)** |
|---|---|---|---|---|---|---|
| **Edit Pay rules** | YES (Full authority) | NO (Locked + Stamp) | NO (Locked + Stamp) | NO (Locked + Stamp) | NO (Locked + Stamp) | NO (Locked + Stamp) |
| **Change Company Prices (new orders only)** | YES | NO | NO | NO | NO | NO |
| **Close & Approve the Week's Pay** | YES | NO | NO | NO | NO (She pays what the founder approves) | NO |
| **Mark Paid, Lock a Cycle & Export the Bank File** | YES (Override) | NO | NO | NO | YES | NO |
| **Create New Customer Lead** | YES | YES | NO | YES | NO | NO |
| **Confirm Order (\`new → confirmed\`)** | YES (If stock \> 0) | YES (Own, if stock \> 0) | NO | YES (If stock \> 0) | NO | NO |
| **Cancel Unshipped Order (\`new\`/\`confirmed\`)** | YES | YES (Own orders) | NO | YES | NO | NO |
| **Dispatch Parcel (\`confirmed → dispatched\`)** | YES | NO (Warehouse only) | NO | NO | NO | YES |
| **Mark Delivered (\`dispatched → delivered\`)** | YES | NO (Blocked: Fraud guard) | NO | NO | NO | YES |
| **Mark Failed Delivery (\`dispatched → cancelled\`)** | YES | NO (Warehouse only) | NO | NO | NO | YES |
| **Record COD Cash Remitted (\`cashIn = true\`)** | YES | NO | NO | NO | YES | NO (Whoever handles parcels does not record the cash) |
| **Process Customer Return (\`delivered → returned\`)** | YES | NO (Warehouse only) | NO | NO (Warehouse only) | NO | YES |
| **Raise & Receive Purchase Orders (POs)** | YES | NO | NO | NO | NO | YES |
| **Load Your Own Data (CSV) / Back to Demo Data** | YES | NO | NO | NO | NO | NO |

**What the live activity strip reveals (`impactFor()`):** Founder: everyone's pay change, delivered revenue, real profit, cash with the courier, and stock. Team lead: their own pay and their closers' pay, plus stock. Closer and media buyer: their own pay plus stock. Warehouse: stock only. Nobody sees another team member's pay unless they supervise them.

# **3. The 5 Pay Rules (Founder Governance Strip)**

The **Pay rules** card sits at the top of the workspace on every role tab. When viewed as **Chidinma (Founder)**, the segmented controls are interactive and display a **Founder authority** badge. When viewed as any other role, all 5 segmented controls are disabled (.seg.locked), and both the card subtitle and bottom lock banner display the audit trail stamp: **"Set by the founder. Last changed 14 Mar by Chidinma O."** (updating dynamically to the latest timestamp whenever Chidinma edits a rule).

**Live What-If Simulator on Every Option Button:** Inside each segmented button, a secondary monospace figure (span.wi) previews what total cycle payroll (sim.payout) would be if that option were selected, and hovering the button shows a tooltip with both **Simulated payout** and **Actual net P&L**.

| **Rule Name & Key**                            | **Available Options**                  | **Default**     | **Exact Mathematical & Operational Behavior**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
|------------------------------------------------|----------------------------------------|-----------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **1. Pay staff when...** (creditOn)             | Lead · Delivery · Cash in              | Delivery        | • **Delivery (\`delivered\`):** Pays 6.5% total (4.0% closer, 1.5% buyer, 1.0% team lead) once stage === 'delivered'. • **Cash in (\`cash\`):** Pays the same 6.5% pool, but **only** when stage === 'delivered' && cashIn === true (withholding commission on orders \#1047 and \#1050 while cash is still with the courier). • **Lead (\`lead\`):** Realistic lower rate of 2.75% total (1.5% closer, 0.75% buyer, 0.5% lead), but credited on **every** created order immediately regardless of whether it ever ships or lands.       |
| **2. Pay taken back** (onReturn) | Take back now · Take back next week · Business absorbs | Take back now   | Governs what happens when an order returns: • **Unpaid accrual (same cycle):** Reverses immediately under Take back now or Offset; kept by staff under Absorb. • **Post-close return (paid in prior open-window cycle like W43):** Take back now deducts the paid commission immediately in the current open cycle (W44). Take back next week schedules the deduction into the next cycle's carryIn when W44 closes. Business absorbs leaves the paid commission untouched. • **Locked cycle (\`W42\`):** Always final — never clawed back under any policy. |
| **3. Two closers, one order** (split)          | First touch · Last touch · 50-50       | Last touch      | Applies when order.openedBy !== order.closer (e.g. **Order \#1053**, opened by Amaka, closed by Chidi): • **First touch (\`first\`):** 100% of closer commission goes to openedBy (Amaka). • **Last touch (\`last\`):** 100% of closer commission goes to closer (Chidi). • **50-50 (\`half\`):** 50% (2.0%) to openedBy and 50% (2.0%) to closer.                                                                                                                                                                                       |
| **4. Pay structure** (payModel)                | Sales pay only · Salary + sales pay      | Salary + sales pay | • **Base + variable (\`base_plus\`):** Folds weekly pro-rated base salaries (₦122,307/wk) into staff payslips and P&L payroll. Target payroll ceiling = 35% of delivered revenue. • **Commission only (\`commission\`):** Zero base pay (₦0); staff earn sales pay only. Target payroll ceiling = 10%.                                                                                                                                                                                                                         |
| **5. Return-rate gate** (returnCap)    | Off · 30% cap · 20% cap                | Off (100%)      | Calculates each closer's resolved return rate across all cycles: returned / (delivered + returned). • Amaka is at 33.3% (3 returned / 9 resolved); Chidi is at 12.5% (1 returned / 8 resolved). • When set to 30% cap or 20% cap, any closer whose return rate exceeds the cap has their commission halved (× 0.5) across the cycle (the multiplier is only ever 1.0× or 0.5×).                                                                                                                           |

# **4. True Operating P&L Engine & Financial Formulas**

The **Founder & CEO View** opens with the **Founder summary Headline** and the **Where the money went (profit waterfall)**. Below are the exact mathematical formulas and initial seed values for active cycle **W44** under the default rules (Delivery, Take back now, Last touch, Salary + sales pay, Return-rate gate Off).

## **4.1 The Three Net Figures Compared in the Headline Banner**

| **Metric Name**                            | **Formula**                                                                                                | **Initial W44 Value** | **Executive Interpretation**                                                                                                                                         |
|--------------------------------------------|------------------------------------------------------------------------------------------------------------|-----------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **1. What your sales report says**        | Delivered Revenue − Sales pay                                                                    | +₦497,888             | The dangerous illusion reported by basic sales trackers (₦532,500 − ₦34,613). Makes the week look wildly profitable while the business is actually underwater.       |
| **2. Left after product and ads**          | Delivered Revenue − Product cost − Sales pay − Ad Spend                                                  | −₦5,613               | The immediate founder reality check (₦532,500 − ₦222,500 − ₦34,613 − ₦281,000 = −₦5,613). Shows the business is losing ₦5,613 before fixed overhead and logistics. |
| **3. Full Operating Net (\`pnl.actual\`)** | Delivered Revenue − Refunds − Product cost − Damaged stock − Sales pay − Fixed salary − Ad Spend − Delivery fees | −₦152,420             | The complete bottom line after deducting weekly pro-rated sales base (₦122,307) and ₦3,500 delivery fees (₦24,500).                                               |

## **4.2 All 8 Lines of the Where the money went (profit waterfall) (\`W44\`)**

| **Waterfall Line**                   | **Sign** | **Default W44 Amount** | **Exact Derivation & Contributing Seed Records**                                                                                                                                                                                                              |
|--------------------------------------|----------|------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Delivered revenue** (revenue)      | \+       | ₦532,500               | Sum of orderValue(o) = unitPrice × qty for all orders delivered in W44 (stage === 'delivered'): \#1041 (₦212,000) + \#1042 (₦90,000) + \#1044 (₦45,000) + \#1047 (₦112,000) + \#1050 (₦73,500) = ₦532,500.                                                                      |
| **Refunds** (refunds)    | −        | ₦0 (Until triggered)   | Sum of orderValue(o) for orders delivered in a prior cycle (W42/W43) that are returned during W44 (reversedCycle === 'W44'). Returning \#1033 adds −₦212,000 here.                                                                                            |
| **Product cost** (cogs)      | −        | ₦222,500               | Unit cost × quantity for all W44 delivered orders, minus unit cost of resellable prior-cycle returns: \#1041 (AIR-12 ×1 = ₦78k) + \#1042 (KET-03 ×2 = ₦39k) + \#1044 (KET-03 ×1 = ₦19.5k) + \#1047 (STM-09 ×1 = ₦52k) + \#1050 (BLN-07 ×1 = ₦34k) = ₦222,500. |
| **Damaged stock** (writeoffs)   | −        | ₦0 (Until triggered)   | Unit cost × quantity for orders returned in W44 with warehouse inspection condition set to **Damaged in transit** (returnCondition === 'damaged').                                                                                                            |
| **Sales pay** (commission) | −        | ₦34,613 (6.5%)         | Sum of sales pay minus any pay taken back in W44 (6.5% × ₦532,500 = ₦34,612.50, rounded to ₦34,613).                                                                                                                                       |
| **Fixed salary** (base)            | −        | ₦122,307               | Weekly pro-rated base salary across the 5 sales staff (Amaka ₦16,154, Chidi ₦16,154, Tobi ₦27,692, Zainab ₦27,692, Ngozi ₦34,615). Drops to ₦0 if Pay Structure is switched to Commission only.                                                               |
| **Meta ad spend** (adSpend)          | −        | ₦281,000               | Cycle W44 ad spend from the **Simulated Meta feed** (demo figures, not a live connection): **Tobi Ade** (₦185,000) + **Zainab Bello** (₦96,000) = ₦281,000. Any media buyer can run any campaign.                                                                                                                                        |
| **Delivery fees** (logistics)     | −        | ₦24,500                | ₦3,500 per completed delivery trip: 1 outbound leg for each order delivered in W44 (#1041, #1042, #1044, #1047, #1050, plus #1046, which landed before it came back = 6 legs), 1 leg for each failed delivery attempt, and 1 return leg for each order returned in W44 (#1046 = 1 leg). Total = 7 legs × ₦3,500 = ₦24,500. Orders still in transit (#1043, #1052, #1053) are not charged until the courier completes or fails the attempt.              |

# **5. Payout Cycle Lifecycle, Pay Taken Back & Negative Payslip Protection**

Everything in Kova is anchored to a weekly payout cycle (CycleBar.tsx). Instead of commissions floating in an endless 'accrued' state forever, the founder progresses cycles through a strict 4-stage state machine:

| **Cycle Stage**                | **Badge Tone**          | **Progress Bar**      | **What Happens & What Actions Are Available**                                                                                                                                                                                                                                                                 |
|--------------------------------|-------------------------|-----------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **1. Accruing (\`open\`)**     | Info (Accruing)         | 1 / 4 dark-green bars | Live calculation window (currently **W44 · 26 Oct – 1 Nov**). Every rule toggle or order transition updates payslips live. Founder sees the **Close & approve W44** button.                                                                                                                                   |
| **2. Approved (\`approved\`)** | Light Yellow (Approved) | 2 / 4 dark-green bars | Triggered when the founder clicks **Close & approve**. Freezes the cycle's payout lines (c.lines), snapshots the cycle's P&L (c.pnl), calculates any negative payslip carry-forwards (carryOut), and automatically opens the next cycle (**W45**). Founder can now click **Mark paid**.                       |
| **3. Paid (\`paid\`)**         | Dark Green (Paid)       | 3 / 4 dark-green bars | Cash has been disbursed to staff bank accounts (currently **W43 · 19 Oct – 25 Oct**). The post-close return window is still open: if a W43 order (like \#1033) returns now, Take back now deducts the commission from W44 payslips, or Take back next week schedules it into W45. Founder can click **Lock cycle**. |
| **4. Locked (\`locked\`)**     | Neutral (Locked)        | 4 / 4 dark-green bars | Accounting books are closed (currently **W42 · 12 Oct – 18 Oct**). If a W42 order (like \#1024) returns after lock, the commission is **kept (final)** under all return rules so historical payroll is never mutated.                                                                                         |

## **5.1 Negative Payslip Protection & Carry-Forward (\`payslip()\`)**

> **•** For each sales person, gross = base + commission + adjustments + carry.
>
> **•** If pay taken back after a week closes exceeds a staff member's earnings in a cycle (gross \< 0, which happens under Sales pay only when a large prior-cycle order returns), payable is floored at **\`₦0\`** (Math.max(0, Math.round(gross))) — because you cannot send a negative bank transfer.
>
> **•** The unpaid deficit (carryOut = Math.round(gross)) is automatically carried forward into the next cycle's carryIn array when the cycle closes, ensuring the company recovers the balance from future earnings.

## **5.2 One-Click Bank Payout CSV Export**

> **•** Every cycle card (W42, W43, W44) has a **Bank CSV** button (founder and accountant only; other roles never see it) that generates and downloads kova-payouts-\<cycleId\>.csv with columns: Cycle, Status, Staff ID, Name, Role, Base (NGN), Sales pay (NGN), Pay taken back (NGN), Prior Carry (NGN), Net Payable (NGN), Carry To Next Cycle (NGN).

## **5.3 Try It With Your Orders (CSV Import)**

> **• Where:** the founder-only **Try it with your orders** button in the sidebar opens the import dialog (`ImportDialog.tsx`). **Your data never leaves this browser:** the files are read on the device, parsed in `lib/importer.ts`, and stored only in this browser's localStorage. Nothing is uploaded.
>
> **• Three files (templates can be downloaded from the dialog):** **Orders** (required): `order_id, date, customer, city, sku, qty, price, stage, closer, campaign`. **Ad spend** (optional): `date, amount`. **Products** (optional): `sku, name, cost, on_hand` (plus an optional `price`). A products file is needed for any SKU outside the five demo SKUs, because profit needs a product cost; a SKU with no cost is a clear error rather than a silent zero.
>
> **• Rules for the orders file:** dates are `YYYY-MM-DD`; `price` is the price of **one unit** (a leading ₦ and thousands commas are accepted); `qty` is a whole number from 1 to 1,000; `stage` is one of new, confirmed, dispatched, delivered, returned, cancelled or failed; `closer` must match a demo closer (Amaka Obi or Chidi Nwosu, by id, first name or full name). Up to 5,000 rows, 26 weeks and 2 MB per file.
>
> **• Validation:** every problem is listed with the file, the line and the column (for example "orders file, line 4, qty: Quantity "0" must be a whole number from 1 to 1000"). Nothing loads until the files are clean, and a bad file can never crash the app. Notes that do not block (unknown columns, a SKU sold at several prices, ad spend outside the order weeks) are shown separately.
>
> **• How the numbers are built:** weeks run Monday to Sunday from each order date and are numbered from the ISO week of the first order. The earlier weeks are closed and paid through the same engine as the demo (`closeCycle` → `markPaid`, with all but the latest closed week locked); the **latest week is the open cycle**. Ad spend is summed into its week and credited to one stand-in media buyer (**Imported Ads**, with the demo buyer salary). The team lead, salaries and the five pay rules are the demo's. Delivered and returned orders count in the week of their order date with the cash treated as received, because the file has no delivery dates. Stock on hand comes from the products file; if it is missing it is set to the units in open orders plus a reorder buffer so nothing is blocked.
>
> **• While your data is loaded:** a banner says so and repeats that the data never leaves the browser, with **Load different files** and **Back to demo data** buttons (founder only). The demo-only 60-second tour is hidden. **Back to demo data** restores the seed in one click; the sidebar **Reset demo state** does the same.

# **6. Role-by-Role Screen & Component Specifications**

## **6.1 Founder & CEO View (\`Chidinma Okoro\`)**

> **• Founder summary Banner (\`.headline\`):** Displays sales pay as a share of sales (6.5%), the real loss (−₦152,420), narrative links to every cost driver, and 4 comparison cards (Naive 'Net after commission', Core actual, Full operating net, and Pay as % of sales).
>
> **• Revenue Flow Funnel (`FlowFunnel`, `revenueFlow()`):** "Where every order is." Every order booked in the open week, and how far it has got, as six steps with the money at each: **Booked** (13 orders, ₦1,850,000) → **Confirmed** (11, ₦1,589,500) → **Sent out** (9, ₦1,003,500) → **Delivered** (6, ₦606,000) → **Delivered and kept** (5, ₦532,500) → **Cash received** (3, ₦347,000). Each step is "reached this stage or beyond", so a step can never exceed the one before it, and a labelled drop-off sits between steps so every naira that fell out is explained (2 orders ₦260,500 waiting to be confirmed; 2 orders ₦586,000 waiting for the warehouse; 3 orders ₦397,500 out for delivery; 1 order ₦73,500 returned; 2 orders ₦185,500 delivered with the cash still with the courier). **Delivered and kept ties exactly to the delivered revenue in the profit figures**, and a note says so (or states the revenue from orders booked in earlier weeks if they differ). Bars are one green hue in six ordinal steps (validated for light and dark); every figure drills into its orders; a "Show as a table" view carries the same numbers.
>
> **• Stuck-or-Leaking Panel (`LeaksPanel`, `leaks()`):** six always-visible checks in two groups, each with what it means, what to do, a ₦ figure that drills into the orders, or a green "Clear" tick. **Stuck on the way in:** *Cash still with the courier* (₦185,500: #1047, #1050) and *Orders waiting on stock* (₦187,000: #1051, no purchase order raised). **Costing you:** *Returns and failed deliveries* (₦7,000: #1046, two delivery fees), *Ad spend above your max* (₦261,000: ad spend beyond max cost per delivered order × delivered orders, from the Simulated Meta feed), *Sales pay before delivery* (₦0 under Delivery, ₦34,210 under Lead) and *Pay kept on returned orders* (₦0 under Take back now). Each row is a different view of the same week, so the panel deliberately shows **no grand total**. Fixing the cause clears the row: raising the max, receiving stock, marking cash received, or changing the pay rules.
>
> **• 5 Founder KPI Tiles (\`.tiles\`):** Delivered revenue (₦532,500), Cash still with courier (₦185,500 from \#1047 and \#1050), Paid on undelivered orders (₦0 under Delivery, jumps to ₦34,210 under Lead), Commission kept on returns / Scheduled next-cycle offsets, and SKUs needing reorder (3 SKUs: AIR-12, KET-03, VAC-21).
>
> **• Where the money went (profit waterfall) & Pay as % of sales meter:** Visual horizontal bar chart of all 8 P&L lines plus a segmented progress meter comparing Sales pay (yellow) + Fixed salary (dark green) against the target ceiling (35% for Base + variable, 10% for Commission only).
>
> **• Closer Quality, Return Gate & Net Contribution Scorecard (\`CloserScorecard.tsx\`):** Side-by-side table auditing **Amaka Obi** vs **Chidi Nwosu** on Delivered vol., Return rate (with visual progress bar and High risk / ½ rate gate / Healthy pills), This week's pay, and **Net margin contrib.** (after product cost, courier legs, damaged write-offs, and closer commission).
>
> **• Full Visibility:** The Founder tab also renders the **Payout Cycles & Settlement** bar, the full **Order Ledger** table, the **Warehouse Stock Book & SKU Unit Economics** tables, and the **Immutable Audit & Event Log**.

> **• Profit per order & Ad Cost Card (`AdBudget.tsx`, founder and media buyer tabs):** Labelled **Simulated Meta feed**: the ad spend is demo data and there is no live Meta connection. Shows **Profit per order, before staff pay** = (delivered revenue − product cost − ad spend) ÷ delivered orders = (₦532,500 − ₦222,500 − ₦281,000) ÷ 5 = **+₦5,800**, and **after staff pay** = that minus (sales pay + fixed salary) ÷ delivered orders = ₦5,800 − ₦156,919.50 ÷ 5 = **−₦25,584**. Delivery fees are not included in either figure. Each media buyer's **ad cost per delivered order** (ad spend ÷ their delivered orders: Tobi ₦185,000 ÷ 2 = ₦92,500, Zainab ₦96,000 ÷ 3 = ₦32,000) is flagged against the founder's **Max cost per order** (default ₦4,000, `maxCostPerOrder`, editable by the founder only, written to the audit log). The max is a flag only; it never changes pay or profit.
>

## **6.2 Closer Phone-First Console (\`Amaka Obi\`)**

> **• Designed for a 390px Smartphone Screen in Lagos Traffic:** Verified at 390×844 viewport with zero horizontal scroll (scrollWidth === 390px).
>
> **• Phone Hero Banner (\`.phone-hero\`):** Shows Delivery certified by Warehouse lock badge, Amaka's live **Net take-home accruing this week** (₦29,114), and a 3-column split (Fixed salary: ₦16,154, Sales pay: ₦12,960, Pay taken back / Carry: ₦0).
>
> **• 3 Personal Closer Tiles:** In your open pipeline (₦39,400 potential sales pay if open orders land), Your return rate (33% — 3 returned out of 9 resolved), and Stock-blocked orders (2 orders waiting on warehouse PO). Closers cannot change prices: every order is the company price × quantity.
>
> **• Stacked Mobile Order Cards (\`.ocard\`):** Replaces the wide desktop table with vertical cards showing Order ID, customer, city, SKU, price, stage pills, **Your closer share**, a yellow warehouse lock note (Only Warehouse (Dayo) can mark dispatched parcels delivered or returned), and allowed closer action buttons (Confirm order, Cancel).

## **6.3 Media Buyer View (\`Tobi Ade\`)**

> **• 5 Media Buyer KPI Tiles:** Net payout this cycle (₦30,722 = ₦27,692 salary + ₦3,030 buyer sales pay), Ad spend from the Simulated Meta feed (₦185,000), Delivered revenue (₦202,000), Sales per ₦1 of ads, delivered (₦1.09 vs ₦6.81 on booked orders), and Left after product, ads, pay (−₦94,130 after product cost, ad spend, courier legs, and commission).
>
> **• Campaign Economics Table:** Compares **Tobi Ade** and **Zainab Bello** (any buyer can run any campaign) across Ad spend, Booked vol., Booked sales per ₦1 of ads, Delivered rev., Delivered sales per ₦1 of ads, Net margin (after product cost), and Cycle pay. Demonstrates why media buyers celebrating ₦6.81 booked sales per ₦1 of ads are actually losing money when orders fail to deliver.

## **6.4 Sales Team Lead View (\`Ngozi Eze\`)**

> **• 4 Team Lead KPI Tiles:** Team lead net payout (₦39,940 = ₦34,615 salary + ₦5,325 team bonus), Team bonus (₦5,325), Team delivered volume (₦532,500), and Split-credit orders (1 order — \#1053).
>
> **• Closer Quality Scorecard:** Gives Ngozi full visibility into Amaka and Chidi's return rates and net margin contributions.

## **6.5 Warehouse & Inventory View (\`Dayo Aremu\`)**

> **• 5 Warehouse KPI Tiles:** SKUs needing reorder (3), Units committed (6 units reserved across confirmed/dispatched orders), Stock on hand (at cost) (₦1,419,000), Open POs inbound (₦0 initially), and Restocked from returns (4 resellable units).
>
> **• Actionable Stock Alert Banner:** Highlights AIR-12: 2 avail, KET-03: 2 avail, VAC-21: 0 avail with a 1-click **Raise POs for all (3)** button. Raising POs moves units into On order with supplier ETAs (leadDays), recalculates Projected = Available + On order, and flips the banner to a dark-green **Stock loop closed** confirmation.
>
> **• Warehouse Stock Book Table:** Columns for SKU, Product, On hand, Committed, Available, On order, Projected, Reorder at, Status (Out of stock, Reorder now, PO inbound, Healthy), Value at cost, and per-SKU **Raise PO (+qty)** / **Receive PO** buttons.
>
> **• Purchase Order Register Table:** Appears automatically once POs are raised, showing PO \#, SKU, Qty, Committed cost, Raised by & timestamp, ETA, Status (In transit / Received), and a **Receive stock** button that increments onHand and unblocks stock-blocked orders like \#1051.
>
> **• SKU Unit Economics & Return Bleed Table:** Audits all 5 SKUs across all cycles (Landed qty, Return rate, Delivered rev., Product cost, Courier & write-offs, Commission, and clickable Net SKU profit).

## **6.6 Accountant View (`Bisi Adeyemi`)**

> **• Job:** record the cash the couriers hand over, and execute the pay the founder has approved. The accountant has **no sales, warehouse or approval buttons**: she cannot confirm, dispatch, deliver, return or cancel an order, change a price or a rule, or close and approve the week. The pay rules are shown read-only, below her work. Her work comes first on screen.
>
> **• 4 Tiles:** Cash still with couriers (₦185,500, 2 orders, oldest this week), Approved awaiting payment (₦0 until the founder approves a week), Paid ready to lock (1: W43), and Delivered revenue (₦532,500). The persona tab carries a badge counting delivered orders still owed cash.
>
> **• Cash Reconciliation (`cashDesk()`):** per week, what was delivered, what cash has arrived, what is still owed and how old it is (an order delivered a week or more ago and still owed shows a red *Overdue* pill with an icon). Below it, each owed order with a **Cash received** button, a **Record all as received** bulk button (one audit entry for the batch), and the amount owed by city (the courier's patch). The week totals, the city totals and the courier-cash tile all add up to the same ₦185,500. On a phone the owed orders stack so the button is always visible.
>
> **• Payout Desk (`payoutQueue()`):** a one-line next step ("W43 is paid. Lock it once its return window has closed", or "W44 is approved. Export the bank file, pay it, then mark it paid"), a week picker, and the payslip table for the chosen week: fixed salary, sales pay, pay taken back, carried over, net payable and the total to pay. Negative balances are never paid; they carry into the next week. **Bank file** exports the CSV; **Mark paid** appears on an approved week and **Lock cycle** on a paid one.
>
> **• The handoff:** the founder closes and approves the week; the accountant then sees it awaiting payment, exports the file, marks it paid and later locks it. The person who approves pay never moves it, and the founder can still override. Each step is in the audit log under the person who did it.
>
> **• Also on this view:** the stuck-or-leaking panel, because courier cash is one of its rows. The live activity strip shows the accountant every person's pay change plus company revenue, profit and courier cash, but not stock.

# **7. Complete Seed Data Reference (SKUs & Orders)**

## **7.1 All 5 Product SKUs (\`products\`)**

| **SKU** | **Product Name**     | **Product cost per unit** | **Company Price** | **On Hand** | **Committed (W44)**     | **Available**    | **Reorder Point** | **Lead Time** |
|---------|----------------------|----------------------|------------------------|-------------|-------------------------|------------------|-------------------|---------------|
| AIR-12  | Air fryer 5.5L       | ₦78,000              | ₦212,000               | 4           | 2 (#1043,#1049)         | 2 (Reorder)      | 3                 | 7 days        |
| BLN-07  | Blender Pro 1200W    | ₦34,000              | ₦73,500                | 12          | 1 (#1053)               | 11 (Healthy)     | 4                 | 5 days        |
| KET-03  | Electric kettle 1.7L | ₦19,500              | ₦45,000                | 2           | 0                       | 2 (Reorder)      | 5                 | 4 days        |
| VAC-21  | Handheld vacuum      | ₦96,000              | ₦187,000               | 2           | 2 (#1045 ×2)            | 0 (Out of stock) | 3                 | 10 days       |
| STM-09  | Garment steamer      | ₦52,000              | ₦112,000               | 9           | 1 (#1052)               | 8 (Healthy)      | 3                 | 6 days        |

## **7.2 Key Seed Orders Designed for Specific Demo Scenarios**

The seed contains **25 orders** across W42 (#1021–#1028, Locked), W43 (#1031–#1038, Paid), and W44 (#1041–#1053, Open). The table below highlights the specific orders crafted to prove each operational rule:

| **Order \#**    | **Cycle**    | **Customer & City**         | **SKU & Value**                          | **Stage & Flags**                          | **What Scenario This Order Demonstrates**                                                                                                                                                        |
|-----------------|--------------|-----------------------------|------------------------------------------|--------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| \#1024          | W42 (Locked) | Halima Sani (Abuja)         | STM-09 ×1 (₦112,000)                      | delivered, paid in W42                     | **Post-Lock Return Finality:** Filter by Paid in W42/W43 and return \#1024. Because W42 is **Locked**, the ₦7,280 sales pay is **kept** even under Take back now.                                   |
| \#1033          | W43 (Paid)   | Kelechi Nnaji (Abuja)       | AIR-12 ×1 (₦212,000)                     | delivered, paid in W43                     | **Post-Close Clawback vs Offset:** Paid in W43 (₦13,780 total sales pay). Returning \#1033 in W44 takes back −₦13,780 immediately in W44 (or schedules a W45 offset).                           |
| \#1045          | W44 (Open)   | Ifeoma Chukwu (Enugu)       | VAC-21 ×2 (₦374,000)                     | confirmed                                  | **Stock Reservation:** Reserves all 2 on-hand units of VAC-21, reducing VAC-21 available stock to 0.                                                                                             |
| \#1047 & \#1050 | W44 (Open)   | Ngozi Okonkwo & Chinedu Eze | STM-09 (₦112k) & BLN-07 (₦73.5k)           | delivered, cashIn: false                   | **COD Cash Still With Courier (\`₦185,500\`):** Marked delivered by courier, but cash hasn't hit the bank. Switching trigger to Cash in withholds commission until **Cash remitted** is clicked. |
| \#1048          | W44 (Open)   | Tunde Bakare (Lagos)        | BLN-07 ×1 (₦73,500)                      | new                                        | **One Company Price:** Priced at BLN-07's company price × quantity. Closers cannot change the price; the founder can change it in Company prices, and only new orders are affected. |
| \#1049          | W44 (Open)   | Hauwa Ibrahim (Abuja)       | AIR-12 ×1 (₦212,000)                     | confirmed                                  | **Flat Closer Rate:** Amaka's closer rate on this order is the full 4.0% (₦8,480) once it lands. Nothing halves it except the Return-rate gate. |
| \#1051          | W44 (Open)   | Aisha Lawal (Kano)          | VAC-21 ×1 (₦187,000)                     | new (Stock-blocked)                        | **Inventory-to-Sales Guardrail:** Trying to click **Confirm order** on \#1051 is blocked with a toast error because VAC-21 has 0 available units until Dayo raises & receives a PO.              |
| \#1053          | W44 (Open)   | Kemi Adebayo (Ibadan)       | BLN-07 ×1 (₦73,500)                      | dispatched, openedBy: amaka, closer: chidi | **Split-Touch Attribution:** Opened by Amaka and closed by Chidi. Toggling **First touch · Last touch · 50-50** re-routes the closer commission between Amaka and Chidi.                         |

# **8. Interactive Modals, Drawers & Overlays (\`Overlays.tsx\`)**

> **• 1. Audit Trail Drill-Down Drawer (\`DrillDrawer\`):** Slides in from the right (@starting-style transition) whenever any \<Fig /\> is clicked. Shows the metric title, subtitle, total formatted figure, and a line-by-line list (ref badge, label, detail, and signed amount), plus total line count in the footer. Dismiss via Esc, the X button, or clicking the backdrop scrim.
>
> **• 2. Return Inspection & Reversal Modal (\`ReturnDialog\`):** Opens when clicking **Process return** on a delivered order. Requires selecting the warehouse inspection condition: • **Resellable · Return to shelf:** Increments available stock (+qty) and charges only the ₦3,500 return courier leg. • **Damaged in transit · Write off product cost:** Does not increment stock and writes off unitCost × qty on the P&L (Damaged write-offs). Also previews the exact **Commission consequence** based on whether the order was credited in the current open cycle, a paid cycle (W43), or a locked cycle (W42).
>
> **• 3. Live Lead Intake Modal (\`NewOrderDialog\`):** Opens when clicking **+ New lead** in the Order Ledger or Command Palette. Allows creating a live order with custom Customer name, Delivery city (Lagos, Abuja, Port Harcourt, Ibadan, Enugu, Kano), Product SKU, Quantity (1–3), Opened by (First touch), Closed by (Last touch), and Media buyer, while previewing warehouse availability and total commission pool.
>
> **• 4. Quick Command Palette (\`CommandPalette\` — \`⌘K\` / \`Ctrl+K\`):** Keyboard-driven spotlight modal with instant search filter to switch themes (Light, Dark), jump to any role persona, create a new lead, toggle any founder rule, close the active payout cycle, or reset demo state.
>
> **• 5. Immutable Audit & Event Log (\`AuditLogCard\`) & Toast Tray (\`ToastTray\`):** Every state mutation appends a timestamped entry to the Audit Log with the actor's avatar, role, cycle ID, description, and signed P&L/payout delta pills (Actual net: −₦14,622, Team payout: +₦14,622), while firing a color-coded toast notification (ok dark green, warn yellow, err light red) in the bottom-right corner.

# **9. Codebase File Map & Verification Suite**

| **File Path**                  | **Responsibility**                                                                                                                                            |
|--------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------|
| app/layout.tsx                 | Next.js RootLayout, Geist Sans & Mono fonts, \<meta name="color-scheme"\> kept in step with the theme, and a FOUC prevention script that defaults to light.                                   |
| app/globals.css                | Adaptive Light/Dark mode design tokens (light-dark()), fixed collapsible sidebar, spotlight cards, spring segmented controls, and resizable table headers.    |
| lib/types.ts                   | Strict TypeScript interfaces for Role, Stage, CreditOn, OnReturn, SplitRule, PayModel, Rules, Order, Cycle, PayLine, PurchaseOrder, Drill, and PnL.           |
| lib/engine.ts                  | Pure, zero-React calculation and mutation engine (computePnl, commissionLines, payslip, whatIf, applyOrderAction, closeCycle, raisePO, receivePO, payoutCsv). |
| components/AdBudget.tsx        | Profit per order, simulated Meta feed label, and each media buyer's ad cost per delivered order against the founder's max.                                |
| components/RevenueFlow.tsx     | Founder-view revenue flow funnel ("Where every order is") and the stuck-or-leaking panel, both drillable. Engine: `revenueFlow()` and `leaks()` in lib/engine.ts. |
| components/ActivityStrip.tsx   | Live activity strip pinned under the top bar on every tab, with per-role chips and an Earlier list. Engine: `impactOf()` and `impactFor()`; events carry an `impact` recorded in the audit log. |
| components/AccountantView.tsx  | Accountant persona: cash reconciliation, owed-orders list with bulk cash recording, payout desk with payslips, bank file, mark paid and lock. Engine: `cashDesk()`, `payoutQueue()`, `canSettle()`, `canApprove()`, `canRecordCash()`. |
| lib/download.ts                | Hands the user a text file built in the browser (bank file, import templates). |
| components/PriceBook.tsx       | Company prices per SKU. Founder-editable, closers read-only; a price change only applies to new orders (each order stores its own unit price). |
| components/ImportDialog.tsx    | Founder-only dialog: template downloads, three file pickers, live validation, summary, and "Show my dashboard". |
| lib/seed.ts                    | Deterministic factory seed (SEED_VERSION = 9) replaying cycles W42 (Locked), W43 (Paid), and W44 (Open) through the engine.                                   |
| lib/rules.ts                   | Metadata and dynamic explanations for the 6 payout and operating rules.                                                                                       |
| lib/importer.ts                | Pure CSV reader, validator and state builder for "Try it with your orders" (templates, line/column errors, weekly cycles replayed through the engine). |
| lib/store.ts                   | Zustand reactive store with localStorage persistence (kova-payout-engine) and action dispatchers.                                                          |
| components/App.tsx             | Application shell, fixed collapsible sidebar, WAI-ARIA role tabs, directional View Transitions, top utility bar, and walkthrough guide.                       |
| components/ui.tsx              | Reusable primitives: \<Fig /\> (number tweening + drill trigger), \<Tile /\>, \<Card /\> (pointer spotlight), \<StagePill /\>, and useTableColumnResize().    |
| components/RulesStrip.tsx      | 6-rule governance strip with live what-if payout badges, spring-animated active thumb, role lock, and founder audit stamps.                                   |
| components/FounderView.tsx     | Founder Reality Check banner, 5 KPI tiles, Where the money went (profit waterfall), and Pay as % of sales meter.                                                              |
| components/CloserScorecard.tsx | Closer quality, return-rate gate, and profit contribution table.                                                                        |
| components/CloserView.tsx      | 390px phone-first closer hero console, personal pipeline tiles, and stock-block alert.                                                                        |
| components/BuyerLeadViews.tsx  | Media Buyer (BuyerView) sales per ₦1 of ads vs what is really left, and the Sales Team Lead (LeadView) team bonus console.                                                             |
| components/CycleBar.tsx        | 4-stage payout cycle cards (Accrued → Approved → Paid → Locked) and 1-click Bank CSV export.                                                                  |
| components/OrderLedger.tsx     | Filterable, searchable order ledger (renders stacked .ocard cards for Closer and resizable .tbl table for other roles).                                       |
| components/StockBook.tsx       | Warehouse Stock Book, Reorder Alert loop, Purchase Order Register, and SKU Unit Economics table.                                                              |
| components/Overlays.tsx        | DrillDrawer, ReturnDialog, NewOrderDialog, CommandPalette, AuditLogCard, and ToastTray.                                                       |
| scripts/verify.ts              | Automated 27-invariant mathematical verification suite (npm.cmd run verify).                                                                                  |
| scripts/e2e.mjs                | Automated 10-scenario headless Chrome E2E test suite verifying DOM, 390px mobile layout, modals, and persistence.                                             |
