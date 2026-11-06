// Deterministic generator for realistic Kovadash test data (a medium COD business, ~1,000-2,000 orders a day).
// Pure: returns file contents and the exact discrepancies it planted. No filesystem, no network, no dependencies.
// scripts/generate-data.mjs writes the result to disk; scripts/verify.ts uses a small set as a test fixture.

/* ------------------------------------------------------------------ random numbers & dates */

function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const addDays = (iso, n) => {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const dayDiff = (a, b) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
const mondayOf = (iso) => addDays(iso, -((new Date(iso + "T00:00:00Z").getUTCDay() + 6) % 7));

const csvCell = (v) => {
  const s = v === undefined || v === null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (header, rows) => [header.join(","), ...rows.map((r) => r.map(csvCell).join(","))].join("\n") + "\n";

/* ------------------------------------------------------------------ the company */

export const DATASETS = {
  // 14 days: two ISO weeks (W44 closed, W45 open), about 21,000 orders
  medium: { start: "2026-10-26", days: 14, perDay: [1000, 2000], seed: 20261108 },
  // 8 days across a week boundary (W44 closed, W45 open), about 2,000 orders: quick to upload and fast for tests
  small: { start: "2026-10-28", days: 8, perDay: [200, 300], seed: 20261103 },
};

const FIRST = ["Ada", "Chioma", "Ngozi", "Amaka", "Funke", "Zainab", "Halima", "Blessing", "Grace", "Kemi", "Tola", "Ife", "Bisi", "Titi", "Nneka", "Aisha", "Hauwa", "Fatima", "Yetunde", "Sade", "Emeka", "Chidi", "Obinna", "Segun", "Tunde", "Musa", "Ibrahim", "Dapo", "Femi", "Kola", "Uche", "Ikenna", "Yakubu", "Sani", "Bola", "Dayo", "Tobi", "Wale", "Rasheed", "Samuel"];
const LAST = ["Okafor", "Adeyemi", "Nwosu", "Bello", "Obi", "Eze", "Ogunleye", "Danjuma", "Balogun", "Chukwu", "Ibrahim", "Lawal", "Akande", "Uche", "Mba", "Etim", "Sani", "Ahmed", "Okonkwo", "Adebayo", "Nnamdi", "Yusuf", "Musa", "Ade", "Ola", "Udo", "Okoro", "Aremu", "Coker", "Fashola"];
const CITIES = [["Lagos", 38, "Kwik"], ["Abuja", 14, "Fez"], ["Port Harcourt", 9, "GIG"], ["Ibadan", 8, "Kwik"], ["Kano", 7, "RedStar"], ["Enugu", 6, "GIG"], ["Benin", 5, "RedStar"], ["Kaduna", 4, "Fez"], ["Abeokuta", 3, "Kwik"], ["Owerri", 3, "GIG"], ["Warri", 3, "RedStar"]];
const PLATFORMS = [["meta", 45], ["tiktok", 30], ["x", 10], ["google", 10], ["snapchat", 5]];
const THEMES = ["Promo", "Retarget", "Launch", "Bundle"];
const LOST_REASONS = ["Never picked up the call", "Said the price was too high", "Just browsing", "Wrong number", "Changed their mind", "Ordered from someone else", "Stopped replying"];
const SOURCES = [["web_form", 70], ["whatsapp", 15], ["call", 8], ["instagram", 7]];
const DELIVERY_FEE = 3500;

const CATALOG = [
  ["Kitchen", ["Air fryer 5.5L", "Blender Pro 1200W", "Electric kettle 1.7L", "Rice cooker 3L", "Toaster 2-slice", "Hand mixer", "Pressure cooker 6L", "Juicer extractor", "Sandwich maker", "Food processor"]],
  ["Home", ["Handheld vacuum", "Garment steamer", "Standing fan 18in", "Room heater", "LED desk lamp", "Iron steam", "Mosquito racket", "Air purifier mini", "Humidifier 2L", "Cordless mop"]],
  ["Beauty", ["Hair dryer 2000W", "Hair straightener", "Facial steamer", "Electric shaver", "Beard trimmer", "Nail drill kit", "Foot massager", "Hair clipper set", "Makeup mirror LED", "Curling wand"]],
  ["Gadgets", ["Power bank 20000mAh", "Bluetooth speaker", "Wireless earbuds", "Smart watch", "Ring light 10in", "Phone tripod", "Car charger duo", "WiFi router 4G", "Webcam HD", "Keyboard mini"]],
  ["Fitness", ["Resistance bands set", "Yoga mat 6mm", "Skipping rope", "Ab roller", "Massage gun", "Dumbbell pair 10kg", "Kettlebell 8kg", "Jump step", "Waist trainer", "Smart scale"]],
];

const SUPPLIERS = ["Shenzhen Brightway", "Guangzhou Unity", "Lagos Wholesale Hub", "Yiwu Trade Co", "Dubai Direct"];

function pick(rand, weighted) {
  const total = weighted.reduce((a, w) => a + w[1], 0);
  let r = rand() * total;
  for (const w of weighted) {
    r -= w[1];
    if (r <= 0) return w[0];
  }
  return weighted[weighted.length - 1][0];
}
const intIn = (rand, lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
const shuffle = (rand, arr) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const sample = (rand, arr, n) => shuffle(rand, arr).slice(0, n);

function buildStaff(rand) {
  const name = (used) => {
    for (;;) {
      const n = `${FIRST[intIn(rand, 0, FIRST.length - 1)]} ${LAST[intIn(rand, 0, LAST.length - 1)]}`;
      if (!used.has(n)) {
        used.add(n);
        return n;
      }
    }
  };
  const used = new Set();
  const staff = [];
  const add = (id, role, title, base, rate, reportsTo) => staff.push({ id, name: name(used), role, title, base, rate, reportsTo });
  add("founder", "founder", "Founder & CEO", 0, "", "");
  add("acc01", "accountant", "Accountant · Finance", 0, "", "");
  add("acc02", "accountant", "Accounts assistant", 0, "", "");
  for (let i = 1; i <= 3; i++) add(`lead${i}`, "lead", "Team lead · Sales", 150000, "", "");
  for (let i = 1; i <= 20; i++) add(`closer${String(i).padStart(2, "0")}`, "closer", "Closer", 70000, i === 1 || i === 2 ? 0.05 : "", `lead${((i - 1) % 3) + 1}`);
  for (let i = 1; i <= 6; i++) add(`buyer${i}`, "buyer", "Media buyer", 120000, i === 1 ? 0.02 : "", "");
  for (let i = 1; i <= 3; i++) add(`stock${i}`, "stock", "Inventory · Lagos warehouse", 0, "", "");
  return staff;
}

function buildProducts(rand) {
  const out = [];
  let n = 1;
  for (const [category, names] of CATALOG) {
    for (const nm of names) {
      const price = Math.round((6000 + rand() * 54000) / 500) * 500;
      const cost = Math.round((price * (0.34 + rand() * 0.2)) / 100) * 100;
      const onHand = intIn(rand, 700, 2600);
      out.push({
        sku: `${category.slice(0, 3).toUpperCase()}-${String(n++).padStart(2, "0")}`,
        name: nm,
        category,
        cost,
        price,
        onHand,
        reorder: intIn(rand, 250, 500),
        leadDays: intIn(rand, 4, 14),
        supplier: SUPPLIERS[intIn(rand, 0, SUPPLIERS.length - 1)],
        weight: 1 / (1 + out.length * 0.12), // a few products sell most of the volume
      });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ generator */

/** @param {{start:string,days:number,perDay:[number,number],seed:number}} cfg */
export function generateDataset(cfg) {
  const rand = prng(cfg.seed);
  const asOf = addDays(cfg.start, cfg.days - 1);
  const openWeekStart = mondayOf(asOf);

  const staff = buildStaff(rand);
  const products = buildProducts(rand);
  const closers = staff.filter((p) => p.role === "closer");
  const buyers = staff.filter((p) => p.role === "buyer");
  const prodWeights = products.map((p) => [p, p.weight]);

  // each buyer runs two or three platforms, each with three campaigns
  const buyerPlatforms = {};
  for (const b of buyers) {
    const plats = sample(rand, PLATFORMS.map((p) => p[0]), intIn(rand, 2, 3));
    buyerPlatforms[b.id] = plats.map((platform) => ({
      platform,
      weight: PLATFORMS.find((p) => p[0] === platform)[1],
      campaigns: sample(rand, THEMES, 3).map((t) => `${platform[0].toUpperCase()}${platform.slice(1)}-${t}-${b.id.slice(-1)}`),
    }));
  }
  const closerWeight = closers.map((c, i) => [c, 0.6 + ((i * 7) % 10) / 10]);

  /* ---- orders */
  const orders = [];
  let orderId = 100000;
  for (let d = 0; d < cfg.days; d++) {
    const date = addDays(cfg.start, d);
    const count = intIn(rand, cfg.perDay[0], cfg.perDay[1]);
    for (let i = 0; i < count; i++) {
      orderId++;
      const p = pick(rand, prodWeights);
      const closer = pick(rand, closerWeight);
      const opener = rand() < 0.82 ? closer : closers[intIn(rand, 0, closers.length - 1)];
      const buyer = buyers[intIn(rand, 0, buyers.length - 1)];
      const bp = pick(rand, buyerPlatforms[buyer.id].map((x) => [x, x.weight]));
      const city = pick(rand, CITIES.map((c) => [c, c[1]]));
      const qty = rand() < 0.8 ? 1 : rand() < 0.75 ? 2 : 3;
      const oldPrice = rand() < 0.03; // a handful were booked before a price change
      const unitPrice = oldPrice ? Math.round((p.price * 0.95) / 500) * 500 : p.price;
      const o = {
        id: orderId,
        date,
        customer: `${FIRST[intIn(rand, 0, FIRST.length - 1)]} ${LAST[intIn(rand, 0, LAST.length - 1)]}`,
        phone: `0${pick(rand, [["803", 1], ["806", 1], ["810", 1], ["703", 1], ["902", 1], ["815", 1]])}${String(intIn(rand, 0, 9999999)).padStart(7, "0")}`,
        city: city[0],
        courier: city[2],
        sku: p.sku,
        qty,
        unitPrice,
        value: unitPrice * qty,
        opener: opener.id,
        closer: closer.id,
        buyer: buyer.id,
        platform: bp.platform,
        campaign: bp.campaigns[intIn(rand, 0, 2)],
        stage: "new",
      };
      // outcome, then how far along it is as of the last day
      const r = rand();
      const outcome = r < 0.6 ? "delivered" : r < 0.72 ? "returned" : r < 0.88 ? "cancelled" : "failed";
      const confirmDay = addDays(date, rand() < 0.9 ? 0 : 1);
      if (confirmDay <= asOf) o.stage = "confirmed";
      if (outcome === "cancelled") {
        const cancelDay = addDays(date, intIn(rand, 0, 2));
        if (cancelDay <= asOf) {
          o.stage = "cancelled";
          o.cancelledDate = cancelDay;
        }
      } else if (o.stage === "confirmed") {
        const dispatchDay = addDays(confirmDay, intIn(rand, 1, 2));
        if (dispatchDay <= asOf) {
          o.stage = "dispatched";
          o.dispatchDay = dispatchDay;
          const endDay = addDays(dispatchDay, intIn(rand, 1, 4));
          if (endDay <= asOf) {
            if (outcome === "failed") {
              o.stage = "failed";
              o.cancelledDate = endDay;
            } else {
              o.stage = "delivered";
              o.deliveredDate = endDay;
              o.cashDay = addDays(endDay, intIn(rand, 2, 9));
              if (outcome === "returned") {
                const ret = addDays(endDay, intIn(rand, 3, 10));
                if (ret <= asOf) {
                  o.stage = "returned";
                  o.returnedDate = ret;
                  o.returnReason = pick(rand, [["Changed mind", 4], ["Item not as described", 3], ["Wrong size or model", 2], ["Damaged in transit", 2], ["Not at home", 1]]);
                  o.returnCondition = o.returnReason === "Damaged in transit" ? "damaged" : rand() < 0.15 ? "damaged" : "resellable";
                }
              }
            }
          }
        }
      }
      orders.push(o);
    }
  }

  /* ---- cash: the system records most courier remittances; the courier statement is the other side */
  const planted = {};
  const deliveredNow = orders.filter((o) => o.stage === "delivered" && o.cashDay && o.cashDay <= asOf);
  for (const o of deliveredNow) if (rand() < 0.985) o.cashReceivedDate = o.cashDay;

  /* ---- leads (open week only) */
  const leads = [];
  let leadId = 800000;
  for (const o of orders) {
    if (o.date >= openWeekStart) {
      leadId++;
      o.leadId = leadId;
      leads.push({ id: leadId, date: o.date, name: o.customer, phone: o.phone, city: o.city, source: pick(rand, SOURCES), platform: o.platform, campaign: o.campaign, status: "booked", reason: "", orderId: o.id });
    }
  }
  const bookedLeads = leads.length;
  const extra = Math.round((bookedLeads / 0.4) * 0.6);
  for (let i = 0; i < extra; i++) {
    const date = addDays(openWeekStart, intIn(rand, 0, dayDiff(openWeekStart, asOf)));
    const b = buyers[intIn(rand, 0, buyers.length - 1)];
    const bp = pick(rand, buyerPlatforms[b.id].map((x) => [x, x.weight]));
    const stillOpen = date === asOf && rand() < 0.1;
    leadId++;
    leads.push({
      id: leadId,
      date,
      name: `${FIRST[intIn(rand, 0, FIRST.length - 1)]} ${LAST[intIn(rand, 0, LAST.length - 1)]}`,
      phone: `0${intIn(rand, 700, 915)}${String(intIn(rand, 0, 9999999)).padStart(7, "0")}`,
      city: pick(rand, CITIES.map((c) => [c[0], c[1]])),
      source: pick(rand, SOURCES),
      platform: bp.platform,
      campaign: bp.campaigns[intIn(rand, 0, 2)],
      status: stillOpen ? "open" : "lost",
      reason: stillOpen ? "" : LOST_REASONS[intIn(rand, 0, LOST_REASONS.length - 1)],
      orderId: "",
    });
  }
  leads.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id));

  /* ---- ad spend: the platform export (what each platform says it billed), per day, buyer, platform, campaign */
  const adRows = [];
  const byKey = new Map();
  for (const o of orders) {
    const k = `${o.date}|${o.buyer}|${o.platform}|${o.campaign}`;
    byKey.set(k, (byKey.get(k) ?? 0) + 1);
  }
  const keys = [...byKey.keys()].sort();
  for (const k of keys) {
    const [date, buyer, platform, campaign] = k.split("|");
    const n = byKey.get(k);
    const spend = Math.round((n * (1900 + rand() * 1400)) / 10) * 10;
    const leadsGot = Math.round(n / 0.4);
    const clicks = leadsGot * intIn(rand, 5, 9);
    adRows.push({ date, platform, account: `${platform}-acct-${buyer.slice(-1)}`, campaign, buyer, spend, impressions: clicks * intIn(rand, 30, 55), clicks, leads: leadsGot });
  }

  /* ---- products, purchase orders */
  const soldOrOut = new Map();
  for (const o of orders) if (o.stage === "confirmed" || o.stage === "dispatched") soldOrOut.set(o.sku, (soldOrOut.get(o.sku) ?? 0) + o.qty);
  const poRows = [];
  const poSkus = sample(rand, products, 14);
  poSkus.forEach((p, i) => {
    const raised = addDays(cfg.start, -intIn(rand, 3, 20));
    const eta = addDays(raised, p.leadDays);
    const received = eta <= asOf && rand() < 0.6;
    poRows.push([`PO-${String(i + 1).padStart(4, "0")}`, p.sku, intIn(rand, 4, 20) * 50, Math.round(p.cost * (0.97 + rand() * 0.08)), raised, received ? eta : addDays(asOf, intIn(rand, 2, 12)), received ? "received" : "open", received ? eta : ""]);
  });

  /* ---- courier statement, with planted problems */
  const stmt = []; // {courier,date,reference,orderId,amount,fee}
  const statementOf = (o, date) => ({ courier: o.courier, date, reference: `REM-${o.courier}-${date.replace(/-/g, "")}`, orderId: o.id, amount: o.value, fee: 0 });
  const onStatement = new Set();
  for (const o of deliveredNow) {
    stmt.push(statementOf(o, o.cashDay));
    onStatement.add(o.id);
  }
  const recorded = deliveredNow.filter((o) => o.cashReceivedDate);
  const take = (arr, n) => sample(rand, arr, Math.min(n, arr.length));
  const scale = Math.max(0.1, orders.length / 21000);
  const n = (base) => Math.max(3, Math.round(base * scale));

  planted.notOnStatement = take(recorded, n(25)).map((o) => o.id); // system says paid, courier statement has no line
  for (const id of planted.notOnStatement) {
    const i = stmt.findIndex((s) => s.orderId === id);
    if (i >= 0) stmt.splice(i, 1);
    onStatement.delete(id);
  }
  const lines = stmt.filter((s) => !planted.notOnStatement.includes(s.orderId));
  planted.shortPaid = take(lines, n(40)).map((s) => {
    const cut = Math.round((s.amount * (0.05 + rand() * 0.25)) / 100) * 100 || 100;
    s.amount -= cut;
    return s.orderId;
  });
  const remaining = lines.filter((s) => !planted.shortPaid.includes(s.orderId));
  planted.overPaid = take(remaining, n(8)).map((s) => {
    s.amount += 1000;
    return s.orderId;
  });
  planted.duplicates = take(remaining.filter((s) => !planted.overPaid.includes(s.orderId)), n(12)).map((s) => {
    stmt.push({ ...s });
    return s.orderId;
  });
  const notDelivered = orders.filter((o) => o.stage === "returned" || o.stage === "cancelled" || o.stage === "failed");
  planted.remittedUndelivered = take(notDelivered, n(20)).map((o) => {
    stmt.push(statementOf(o, addDays(asOf, -intIn(rand, 0, 3))));
    return o.id;
  });
  stmt.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.orderId - b.orderId));
  planted.remittedNotRecorded = deliveredNow.filter((o) => !o.cashReceivedDate && onStatement.has(o.id)).map((o) => o.id);
  planted.deliveredNeverRemitted = orders
    .filter((o) => o.stage === "delivered" && !onStatement.has(o.id) && !o.cashReceivedDate)
    .map((o) => o.id);
  planted.recordedNotOnStatement = planted.notOnStatement;

  /* ---- stock count: the system on_hand is the product file; a physical count disagrees on a few SKUs */
  const countDate = asOf;
  const varianceSkus = take(products, Math.max(3, Math.round(6 * Math.min(1, scale + 0.5))));
  planted.stockVariance = {};
  const countRows = products.map((p) => {
    let counted = p.onHand;
    if (varianceSkus.includes(p)) {
      const delta = (rand() < 0.75 ? -1 : 1) * intIn(rand, 3, 40);
      counted = Math.max(0, p.onHand + delta);
      planted.stockVariance[p.sku] = counted - p.onHand;
    }
    return [countDate, p.sku, counted, `stock${intIn(rand, 1, 3)}`];
  });

  /* ---- what the media buyers reported (their own ledger) against the platform export */
  planted.adReportedDifferences = [];
  planted.adReportedMissing = [];
  const reported = adRows.map((r) => ({ date: r.date, buyer: r.buyer, platform: r.platform, amount: r.spend }));
  // buyers report per day, buyer and platform (campaigns rolled up)
  const rolled = new Map();
  for (const r of reported) {
    const k = `${r.date}|${r.buyer}|${r.platform}`;
    rolled.set(k, (rolled.get(k) ?? 0) + r.amount);
  }
  const reportedRows = [...rolled.entries()].sort().map(([k, amount]) => {
    const [date, buyer, platform] = k.split("|");
    return { date, buyer, platform, amount };
  });
  for (const r of take(reportedRows, n(6))) {
    const diff = (rand() < 0.5 ? -1 : 1) * Math.round((r.amount * (0.03 + rand() * 0.1)) / 10) * 10;
    r.amount += diff;
    planted.adReportedDifferences.push(`${r.date}|${r.buyer}|${r.platform}|${diff}`);
  }
  for (const r of take(reportedRows.filter((x) => !planted.adReportedDifferences.some((d) => d.startsWith(`${x.date}|${x.buyer}|${x.platform}|`))), n(3))) {
    planted.adReportedMissing.push(`${r.date}|${r.buyer}|${r.platform}`);
    r.amount = null;
  }

  /* ---- assemble files */
  const files = {};
  files["products.csv"] = toCsv(
    ["sku", "name", "category", "cost", "price", "on_hand", "reorder_level", "lead_days", "supplier"],
    products.map((p) => [p.sku, p.name, p.category, p.cost, p.price, p.onHand, p.reorder, p.leadDays, p.supplier]),
  );
  files["staff.csv"] = toCsv(
    ["id", "name", "role", "title", "monthly_base", "commission_rate", "reports_to"],
    staff.map((p) => [p.id, p.name, p.role, p.title, p.base, p.rate, p.reportsTo]),
  );
  files["orders.csv"] = toCsv(
    ["order_id", "lead_id", "date", "customer", "phone", "city", "courier", "sku", "qty", "unit_price", "stage", "delivered_date", "cash_received_date", "returned_date", "cancelled_date", "return_reason", "return_condition", "opened_by", "closer", "buyer", "platform", "campaign"],
    orders.map((o) => [o.id, o.leadId ?? "", o.date, o.customer, o.phone, o.city, o.courier, o.sku, o.qty, o.unitPrice, o.stage, o.deliveredDate ?? "", o.cashReceivedDate ?? "", o.returnedDate ?? "", o.cancelledDate ?? "", o.returnReason ?? "", o.returnCondition ?? "", o.opener, o.closer, o.buyer, o.platform, o.campaign]),
  );
  files["leads.csv"] = toCsv(
    ["lead_id", "date", "name", "phone", "city", "source", "platform", "campaign", "status", "reason", "order_id"],
    leads.map((l) => [l.id, l.date, l.name, l.phone, l.city, l.source, l.platform, l.campaign, l.status, l.reason, l.orderId]),
  );
  files["ad_spend.csv"] = toCsv(
    ["date", "platform", "account", "campaign", "buyer", "spend", "impressions", "clicks", "leads"],
    adRows.map((r) => [r.date, r.platform, r.account, r.campaign, r.buyer, r.spend, r.impressions, r.clicks, r.leads]),
  );
  files["purchase_orders.csv"] = toCsv(["po", "sku", "qty", "unit_cost", "raised_date", "eta", "status", "received_date"], poRows);
  files["courier_remittances.csv"] = toCsv(
    ["courier", "date", "reference", "order_id", "amount_remitted", "fee"],
    stmt.map((s) => [s.courier, s.date, s.reference, s.orderId, s.amount, s.fee]),
  );
  files["stock_count.csv"] = toCsv(["date", "sku", "counted", "counted_by"], countRows);
  files["ad_reported.csv"] = toCsv(
    ["date", "buyer", "platform", "amount"],
    reportedRows.filter((r) => r.amount !== null).map((r) => [r.date, r.buyer, r.platform, r.amount]),
  );

  const stages = {};
  for (const o of orders) stages[o.stage] = (stages[o.stage] ?? 0) + 1;
  const expected = {
    config: cfg,
    asOf,
    openWeekStart,
    counts: {
      products: products.length,
      staff: staff.length,
      orders: orders.length,
      leads: leads.length,
      adRows: adRows.length,
      adSpendTotal: adRows.reduce((a, r) => a + r.spend, 0),
      purchaseOrders: poRows.length,
      courierLines: stmt.length,
      stages,
    },
    planted,
    deliveryFee: DELIVERY_FEE,
  };
  return { files, expected, staff, products, orders };
}

export function expectedText(expected) {
  const p = expected.planted;
  const len = (a) => (Array.isArray(a) ? a.length : Object.keys(a).length);
  return [
    "KOVA TEST DATA: what was planted, so reconciliation results can be checked",
    `Orders ${expected.counts.orders}, leads ${expected.counts.leads}, staff ${expected.counts.staff}, products ${expected.counts.products}`,
    `Stages: ${JSON.stringify(expected.counts.stages)}`,
    `Platform ad spend total: ${expected.counts.adSpendTotal}`,
    "",
    "COURIER CASH (courier_remittances.csv vs orders.csv)",
    `  statement lines: ${expected.counts.courierLines}`,
    `  short-paid lines: ${len(p.shortPaid)}`,
    `  over-paid lines: ${len(p.overPaid)}`,
    `  duplicate lines: ${len(p.duplicates)}`,
    `  remitted but order not delivered: ${len(p.remittedUndelivered)}`,
    `  recorded as received but not on the statement: ${len(p.recordedNotOnStatement)}`,
    `  on the statement but not recorded as received: ${len(p.remittedNotRecorded)}`,
    `  delivered, never remitted, not recorded: ${len(p.deliveredNeverRemitted)}`,
    "",
    "STOCK (stock_count.csv vs products.csv)",
    ...Object.entries(p.stockVariance).map(([sku, v]) => `  ${sku}: ${v > 0 ? "+" : ""}${v}`),
    "",
    "AD SPEND (ad_reported.csv vs ad_spend.csv)",
    `  rows that differ: ${len(p.adReportedDifferences)}`,
    `  rows buyers did not report: ${len(p.adReportedMissing)}`,
    ...(p.bank ? ["", "PAYOUTS (bank_statement.csv vs the closed week)", ...Object.entries(p.bank).map(([k, v]) => `  ${k}: ${JSON.stringify(v)}`)] : []),
    "",
  ].join("\n");
}

/** Small files with deliberate mistakes, to prove the error report names the right line and column. */
export function generateBadFiles() {
  const files = {};
  files["orders_bad.csv"] = [
    "order_id,date,customer,city,sku,qty,unit_price,stage,closer,buyer",
    "900001,2026-11-02,Ada Obi,Lagos,KIT-01,1,12000,delivered,closer01,buyer1", // line 2: fine
    "900002,2026-11-02,Musa Bello,Kano,KIT-01,0,12000,delivered,closer01,buyer1", // line 3: qty 0
    "900003,not-a-date,Ife Ade,Abuja,KIT-01,1,12000,delivered,closer01,buyer1", // line 4: bad date
    "900004,2026-11-02,Tola Eze,Lagos,NOPE-99,1,12000,delivered,closer01,buyer1", // line 5: unknown sku
    "900005,2026-11-02,Emma Udo,Enugu,KIT-01,1,12000,flying,closer01,buyer1", // line 6: bad stage
    "900006,2026-11-02,Kemi Ola,Ibadan,KIT-01,1,12000,delivered,ghost,buyer1", // line 7: unknown closer
    "900007,2026-11-02,Bola Ade,Lagos,KIT-01,1,12000,delivered,closer01,ghost", // line 8: unknown buyer
    "900001,2026-11-02,Dup Order,Lagos,KIT-01,1,12000,delivered,closer01,buyer1", // line 9: duplicate id
    "900009,2026-11-02,No Price,Lagos,KIT-01,1,,delivered,closer01,buyer1", // line 10: no price
    "",
  ].join("\n");
  files["staff_bad.csv"] = [
    "id,name,role,title,monthly_base,commission_rate,reports_to",
    "closer01,Ada Obi,closer,Closer,70000,,", // line 2: fine
    "closer01,Dup Person,closer,Closer,70000,,", // line 3: duplicate id
    "x1,No Role,astronaut,Closer,70000,,", // line 4: unknown role
    "x2,Bad Pay,closer,Closer,abc,,", // line 5: bad monthly_base
    "x3,Bad Rate,closer,Closer,70000,1.5,", // line 6: commission rate above 100%
    "x4,Ghost Boss,closer,Closer,70000,,nobody", // line 7: unknown reports_to
    "",
  ].join("\n");
  files["products_bad.csv"] = [
    "sku,name,category,cost,price,on_hand,reorder_level,lead_days,supplier",
    "KIT-01,Air fryer,Kitchen,5000,12000,100,20,7,Acme", // line 2: fine
    "KIT-01,Duplicate,Kitchen,5000,12000,100,20,7,Acme", // line 3: duplicate sku
    "KIT-02,Free item,Kitchen,5000,0,100,20,7,Acme", // line 4: zero price
    "KIT-03,Negative stock,Kitchen,5000,12000,-4,20,7,Acme", // line 5: negative stock
    "",
  ].join("\n");
  files["ad_spend_bad.csv"] = [
    "date,platform,account,campaign,buyer,spend,impressions,clicks,leads",
    "2026-11-02,meta,a1,Promo,buyer1,50000,1000,100,20", // line 2: fine
    "2026-11-02,myspace,a1,Promo,buyer1,50000,1000,100,20", // line 3: unknown platform
    "2026-11-02,tiktok,a1,Promo,buyer1,-5,1000,100,20", // line 4: negative spend
    "tomorrow,x,a1,Promo,buyer1,50000,1000,100,20", // line 5: bad date
    "",
  ].join("\n");
  const errorLines = {
    "orders_bad.csv": { 3: "qty", 4: "date", 5: "sku", 6: "stage", 7: "closer", 8: "buyer", 9: "order_id", 10: "price" },
    "staff_bad.csv": { 3: "id", 4: "role", 5: "monthly_base", 6: "commission_rate", 7: "reports_to" },
    "products_bad.csv": { 3: "sku", 4: "price", 5: "on_hand" },
    "ad_spend_bad.csv": { 3: "platform", 4: "spend", 5: "date" },
  };
  return { files, errorLines };
}
