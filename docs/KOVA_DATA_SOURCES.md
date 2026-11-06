# Kova data sources

Every figure in Kova comes from files you can read in a spreadsheet. This page lists each file, what it needs, how the four reconciliations compare outside files with your company, and how each file maps onto a backend table later. The templates in the app (Load your data, and the Reconcile cards) download the exact headers below.

Everything runs in your browser. Files are read on your device and are never uploaded. The same column layouts become the import contract when Kova gets a backend.

## Limits

| Limit | Value |
|---|---|
| Rows in one file | 60,000 |
| Size of one file | 15 MB |
| Weeks of orders | 26 |
| Errors listed at once | 200 (each with file, line and column) |

Money is whole naira. Dates are `YYYY-MM-DD`. Columns can be in any order; unknown columns are ignored. A bad value stops the import and is reported with its line and column, so you fix the file and try again. Nothing is half-loaded.

## 1. Starting data (builds the company)

Only **orders** is required. Without the others, sensible defaults apply (the demo team, the demo catalogue).

### orders.csv (required)
`order_id,date,customer,city,sku,qty,unit_price,stage,delivered_date,cash_received_date,returned_date,cancelled_date,return_reason,return_condition,opened_by,closer,buyer,platform,campaign`

| Column | Notes |
|---|---|
| `order_id` | Whole number, unique. A repeated id is an error. |
| `date` | The day the order was booked. Decides which week it belongs to. |
| `sku`, `qty`, `unit_price` | The SKU must exist in `products.csv` (or the demo catalogue). `unit_price` is the price at the time of the order. |
| `stage` | `new`, `confirmed`, `dispatched`, `delivered`, `returned`, `cancelled`, `failed`. |
| `delivered_date`, `cash_received_date`, `returned_date`, `cancelled_date` | Optional; they put each event in the week it happened, which decides when pay is credited and reversed. |
| `return_reason`, `return_condition` | `resellable` or `damaged`. A damaged return is not restocked. |
| `opened_by`, `closer`, `buyer` | Staff ids from `staff.csv`. With a staff file, `buyer` is required and every id must exist. |
| `platform`, `campaign` | Where the lead came from. Feeds ad-cost and campaign views. |

### staff.csv
`id,name,role,title,monthly_base,commission_rate,reports_to`

`role` is one of `founder`, `closer`, `buyer`, `lead`, `accountant`, `stock`. `monthly_base` is the monthly salary, paid out weekly. `commission_rate` is optional and overrides the standard rate for that person. `reports_to` is the team lead's id.

### products.csv
`sku,name,category,cost,price,on_hand,reorder_level,lead_days,supplier`

Required: `sku`, `cost`. `price` is the single company price; a change affects new orders only.

### leads.csv
`lead_id,date,name,phone,city,source,platform,campaign,status,reason,order_id`

Required: `lead_id`, `date`, `name`, `status` (`open`, `booked`, `lost`). Feeds the funnel and the lost-lead leak. Use the latest week only.

### ad_spend.csv (a platform export)
`date,platform,account,campaign,buyer,spend,impressions,clicks,leads`

Required: `date`, `platform`, `spend`. `platform` is `meta`, `tiktok`, `x`, `google`, `snapchat` or `other`. A plain `date,spend` file also works; it is treated as a single total per day.

### purchase_orders.csv (shown in the app as "Supplier stock orders")

Not customer orders. Each row is stock you bought from a supplier: `open` rows show as "On order" on the Stock page, `received` rows have already been added to the shelf. `orders.csv` is what customers bought from you; this file is what you bought for the shelf.

`po,sku,qty,unit_cost,raised_date,eta,status,received_date`

Required: `po`, `sku`, `qty`, `unit_cost`, `status` (`open` or `received`).

## 2. Statement comparison files (compared, never loaded)

> Parked: the "Compare Statements" section is not shown in the app for now, because statements are not always on hand. The code (`components/ReconcileView.tsx`, `lib/reconcile.ts`) is kept and still tested by `npm test`.

These are checked against the company you loaded. They never replace it and are not saved; upload again to re-run. Money agrees when both sides are within ₦0.50.

| File | Columns | Compared with | Findings |
|---|---|---|---|
| Courier cash statement | `courier,date,reference,order_id,amount_remitted,fee` | Delivered orders and their value | Matched, short-paid, over-paid, repeated reference, cash for an order that was not delivered, delivered and never remitted (what each courier still owes). Matched lines can be recorded as received in one step. |
| Ad spend as reported | `date,buyer,platform,amount` | The platform export's spend per day, buyer and platform | Amounts that differ, spend nobody reported, platform totals. |
| Stock count | `date,sku,counted,counted_by` | What the system believes is on the shelf | Units over or short per SKU and what that is worth at cost; SKUs not counted. Nothing is adjusted automatically. |
| Bank statement | `date,reference,description,debit,credit,payee` | What a closed week says each person is owed | Unpaid people, wrong amount, paid twice, payee nobody recognises. |

Who sees which card: the accountant sees courier cash and payouts; the founder sees all four; the warehouse sees the stock count; media buyers see none.

## 3. Permanent actions

Every action that changes the books opens one confirmation first. It states what is about to happen, previews what it will change (pay, revenue, profit, courier cash, stock, scoped to what your role may see), and warns:

> This is recorded in the audit log with your name and the time. It is permanent and cannot be undone.

These actions also require a written reason or reference before **Confirm** unlocks. It is saved on the audit entry and shown in the log and the order table.

| Action | The note asks for |
|---|---|
| Cancel an order | Why it is cancelled |
| Failed delivery | Why it failed |
| Return | Why it came back (and its condition) |
| Courier cash received | Courier reference |
| Mark a week paid | Bank reference |
| Lock a week | Why lock now |
| Change a price | Why the price is changing |

Confirm, send out, deliver, close and approve, purchase orders, pay-rule changes, the ad cost limit and loading your own files show the same dialog without a required note.

## 4. Other sources worth planning

Not built yet: couriers with per-city fees, customer refund payments, overheads (rent, software, salaries outside sales), payment-gateway settlements, supplier invoices, connectors for WhatsApp, Shopify, WooCommerce and Google Sheets, and platform APIs (Meta, TikTok, X) to replace `ad_spend.csv`.

## 5. Mapping to backend tables

| File | Table | Notes |
|---|---|---|
| `staff.csv` | `people` | `role`, `reports_to`, `commission_rate`, `monthly_base` |
| `products.csv` | `products`, `stock_levels` | Price on the product; orders keep their own `unit_price` |
| `orders.csv` | `orders`, `order_events` | One event per stage date; weekly cycle derived from event dates |
| `leads.csv` | `leads` | |
| `ad_spend.csv` | `ad_spend` | One row per day, platform, campaign |
| `purchase_orders.csv` | `purchase_orders` | |
| Courier cash statement | `courier_remittances` | Reconciled by a server job against `orders` |
| Ad spend as reported | `ad_reported` | |
| Stock count | `stock_counts` | |
| Bank statement | `bank_lines` | Matched to payslips |
| Audit log | `audit_events` | `note` column holds the typed reason or reference |

Decisions to settle before the migration: money stored in kobo with a fixed rounding rule, UUIDs with per-workspace order numbers, cycles keyed by year and ISO week, the return-rate window, and per-workspace commission rates.
