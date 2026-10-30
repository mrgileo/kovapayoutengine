import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

// ─── Minimal Standards-Compliant ZIP Archive Builder for OpenXML (.docx) ───
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[n] = c >>> 0;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function buildZip(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const file of files) {
    const nameBuf = Buffer.from(file.name, "utf8");
    const rawBuf = Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data, "utf8");
    const crc = crc32(rawBuf);
    const deflated = zlib.deflateRawSync(rawBuf, { level: 9 });

    const localHeader = Buffer.alloc(30 + nameBuf.length);
    localHeader.writeUInt32LE(0x04034b50, 0); // signature
    localHeader.writeUInt16LE(20, 4); // version needed
    localHeader.writeUInt16LE(0, 6); // flags
    localHeader.writeUInt16LE(8, 8); // compression method (8 = deflate)
    localHeader.writeUInt16LE(0, 10); // mod time
    localHeader.writeUInt16LE(0, 12); // mod date
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(deflated.length, 18);
    localHeader.writeUInt32LE(rawBuf.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28); // extra length
    nameBuf.copy(localHeader, 30);

    localParts.push(localHeader, deflated);

    const centralHeader = Buffer.alloc(46 + nameBuf.length);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4); // version made by
    centralHeader.writeUInt16LE(20, 6); // version needed
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(deflated.length, 20);
    centralHeader.writeUInt32LE(rawBuf.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    nameBuf.copy(centralHeader, 46);

    centralParts.push(centralHeader);
    offset += localHeader.length + deflated.length;
  }

  const centralBuf = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralBuf, eocd]);
}

// ─── OpenXML Helpers ───
function esc(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function run(text, opts = {}) {
  const rPr = [];
  if (opts.bold) rPr.push("<w:b/>");
  if (opts.italic) rPr.push("<w:i/>");
  if (opts.color) rPr.push(`<w:color w:val="${opts.color}"/>`);
  if (opts.size) rPr.push(`<w:sz w:val="${opts.size}"/><w:szCs w:val="${opts.size}"/>`);
  if (opts.mono) {
    rPr.push(`<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/>`);
  }
  if (opts.shd) {
    rPr.push(`<w:shd w:val="clear" w:color="auto" w:fill="${opts.shd}"/>`);
  }
  return `<w:r>${rPr.length ? `<w:rPr>${rPr.join("")}</w:rPr>` : ""}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
}

/** Parses inline **bold** and `code` markers into runs. */
function richRuns(text, baseOpts = {}) {
  const parts = String(text).split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts
    .filter((p) => p.length > 0)
    .map((part) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return run(part.slice(2, -2), { ...baseOpts, bold: true });
      }
      if (part.startsWith("`") && part.endsWith("`")) {
        return run(part.slice(1, -1), {
          ...baseOpts,
          mono: true,
          shd: baseOpts.shd || "F4F4F0",
          color: baseOpts.codeColor || "713F12",
        });
      }
      return run(part, baseOpts);
    })
    .join("");
}

function p(text, opts = {}) {
  const pPr = [];
  if (opts.style) pPr.push(`<w:pStyle w:val="${opts.style}"/>`);
  if (opts.align) pPr.push(`<w:jc w:val="${opts.align}"/>`);
  const before = opts.spaceBefore ?? 80;
  const after = opts.spaceAfter ?? 120;
  const line = opts.line ?? 276;
  pPr.push(`<w:spacing w:before="${before}" w:after="${after}" w:line="${line}" w:lineRule="auto"/>`);
  if (opts.indentLeft) pPr.push(`<w:ind w:left="${opts.indentLeft}"/>`);
  if (opts.shd) pPr.push(`<w:shd w:val="clear" w:color="auto" w:fill="${opts.shd}"/>`);
  if (opts.borderLeft) {
    pPr.push(
      `<w:pBdr><w:left w:val="single" w:sz="24" w:space="12" w:color="${opts.borderLeft}"/><w:top w:val="single" w:sz="4" w:space="6" w:color="E4E4E7"/><w:right w:val="single" w:sz="4" w:space="6" w:color="E4E4E7"/><w:bottom w:val="single" w:sz="4" w:space="6" w:color="E4E4E7"/></w:pBdr>`,
    );
  }
  const content = Array.isArray(text) ? text.join("") : richRuns(text, opts.run || {});
  return `<w:p><w:pPr>${pPr.join("")}</w:pPr>${content}</w:p>`;
}

function h1(title) {
  return p([run(title, { bold: true, size: 34, color: "09090B" })], {
    style: "Heading1",
    spaceBefore: 360,
    spaceAfter: 140,
  });
}

function h2(title) {
  return p([run(title, { bold: true, size: 26, color: "14532D" })], {
    style: "Heading2",
    spaceBefore: 260,
    spaceAfter: 100,
  });
}

function h3(title) {
  return p([run(title, { bold: true, size: 22, color: "854D0E" })], {
    style: "Heading3",
    spaceBefore: 180,
    spaceAfter: 80,
  });
}

function bullet(text, level = 0) {
  const indent = 360 + level * 360;
  const marker = level === 0 ? "•  " : "◦  ";
  return p(
    [run(marker, { bold: true, color: "EAB308" }), richRuns(text, { size: 21, color: "18181B" })],
    { indentLeft: indent, spaceBefore: 40, spaceAfter: 60 },
  );
}

function callout(title, body, borderColor = "FACC15", bgFill = "FEFCE8") {
  return p(
    [
      run(title + " — ", { bold: true, size: 21, color: "09090B" }),
      richRuns(body, { size: 21, color: "27272A", shd: bgFill }),
    ],
    {
      shd: bgFill,
      borderLeft: borderColor,
      spaceBefore: 140,
      spaceAfter: 160,
      indentLeft: 180,
    },
  );
}

function table(headers, rows, colWidths) {
  const totalWidth = 9360; // 6.5 inches in twips
  const ncols = headers.length;
  const widths =
    colWidths ||
    headers.map(() => Math.floor(totalWidth / ncols));

  const gridCols = widths.map((w) => `<w:gridCol w:w="${w}"/>`).join("");

  const headerCells = headers
    .map(
      (h, i) => `
      <w:tc>
        <w:tcPr>
          <w:tcW w:w="${widths[i]}" w:type="dxa"/>
          <w:shd w:val="clear" w:color="auto" w:fill="09090B"/>
          <w:tcMar>
            <w:top w:w="100" w:type="dxa"/>
            <w:bottom w:w="100" w:type="dxa"/>
            <w:left w:w="120" w:type="dxa"/>
            <w:right w:w="120" w:type="dxa"/>
          </w:tcMar>
        </w:tcPr>
        <w:p>
          <w:pPr><w:spacing w:before="20" w:after="20"/></w:pPr>
          ${run(h, { bold: true, size: 19, color: "FACC15" })}
        </w:p>
      </w:tc>`,
    )
    .join("");

  const bodyRows = rows
    .map((row, rIdx) => {
      const fill = rIdx % 2 === 1 ? "F8F8F5" : "FFFFFF";
      const cells = row
        .map(
          (cell, cIdx) => `
          <w:tc>
            <w:tcPr>
              <w:tcW w:w="${widths[cIdx]}" w:type="dxa"/>
              <w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>
              <w:tcMar>
                <w:top w:w="85" w:type="dxa"/>
                <w:bottom w:w="85" w:type="dxa"/>
                <w:left w:w="120" w:type="dxa"/>
                <w:right w:w="120" w:type="dxa"/>
              </w:tcMar>
            </w:tcPr>
            <w:p>
              <w:pPr><w:spacing w:before="20" w:after="20"/></w:pPr>
              ${richRuns(String(cell), { size: 19, color: "18181B", shd: fill })}
            </w:p>
          </w:tc>`,
        )
        .join("");
      return `<w:tr>${cells}</w:tr>`;
    })
    .join("");

  return `
  <w:tbl>
    <w:tblPr>
      <w:tblW w:w="${totalWidth}" w:type="dxa"/>
      <w:tblBorders>
        <w:top w:val="single" w:sz="6" w:space="0" w:color="D4D4D8"/>
        <w:left w:val="single" w:sz="6" w:space="0" w:color="D4D4D8"/>
        <w:bottom w:val="single" w:sz="8" w:space="0" w:color="09090B"/>
        <w:right w:val="single" w:sz="6" w:space="0" w:color="D4D4D8"/>
        <w:insideH w:val="single" w:sz="4" w:space="0" w:color="E4E4E7"/>
        <w:insideV w:val="single" w:sz="4" w:space="0" w:color="E4E4E7"/>
      </w:tblBorders>
      <w:tblLayout w:type="fixed"/>
    </w:tblPr>
    <w:tblGrid>${gridCols}</w:tblGrid>
    <w:tr><w:trPr><w:tblHeader/></w:trPr>${headerCells}</w:tr>
    ${bodyRows}
  </w:tbl>
  ${p("", { spaceBefore: 40, spaceAfter: 80 })}`;
}

// ─── Document Content Assembly ───
const bodyElements = [
  // Cover / Title Banner
  p([run("KOVA SUPPLY CO.", { bold: true, size: 22, color: "CA8A04" })], {
    spaceBefore: 0,
    spaceAfter: 40,
  }),
  p(
    [
      run("Kova Payout, P&L & Stock Engine — Complete Product Specification & User Guide", {
        bold: true,
        size: 44,
        color: "09090B",
      }),
    ],
    { spaceBefore: 0, spaceAfter: 120 },
  ),
  p(
    "Comprehensive functional, financial, operational, and UI/UX specification of the Kova Payout Engine application. Written as a complete reference manual so any CEO, operator, engineer, or reviewer can navigate and audit every calculation, workflow, and screen without ambiguity.",
    { run: { size: 22, italic: true, color: "52525B" }, spaceAfter: 200 },
  ),
  callout(
    "Core Executive Thesis",
    "In Cash-on-Delivery (COD) and high-velocity e-commerce, paying sales teams on raw order volume while tracking P&L in a separate spreadsheet creates an operational blind spot: payout ratios look healthy (6.5%) while the business is quietly losing money once Cost of Goods Sold (COGS), Meta ad spend, pro-rated base salaries, courier leg fees, discounts, and customer returns are accounted for. Kova unifies Compensation, True Operating P&L, Courier Cash Remittance, and Warehouse Inventory into a single live engine.",
  ),

  // SECTION 1
  h1("1. Application Overview & Navigation Architecture"),
  p(
    "The Kova Payout Engine is a client-persisted Next.js 15 + React 19 + TypeScript application that simulates a multi-role Nigerian COD e-commerce operation (**Kova Supply Co.**) across three weekly payout cycles (**W42**, **W43**, and active cycle **W44**). Every action taken by any persona immediately recalculates company-wide P&L, staff payslips, warehouse stock reservations, and the immutable audit log.",
    { run: { size: 21 } },
  ),

  h2("1.1 Global Layout & Shell"),
  bullet(
    "**Fixed & Collapsible Left Sidebar (`.side`):** Pinned to the left viewport edge (`position: fixed; height: 100dvh`) on desktop (`> 920px`) so it never scrolls away when inspecting long tables. Defaults to `276px` wide and collapses smoothly into a `72px` compact icon rail via the header toggle button, the top-bar toggle button, or the keyboard shortcut `Ctrl+B` / `⌘B`. In collapsed mode, persona avatars remain centered with hover tooltips and corner stock-alert badges.",
  ),
  bullet(
    "**Sticky Top Utility Bar (`.topbar`):** Remains pinned at the top of the main workspace. Displays the pulsing yellow live indicator, active cycle badge (`Cycle W44 · 26 Oct – 1 Nov`), a live clickable **Net P&L** pill, the **Light Mode / Dark Mode** theme toggle button, and the **Quick Actions (`⌘K` / `Ctrl+K`)** Command Palette trigger.",
  ),
  bullet(
    "**Directional View Transitions:** Switching between role personas animates the main workspace directionally (`forwards` sliding up when moving down the org chart, `backwards` sliding down when moving up) using the native browser `document.startViewTransition()` API with graceful fallback.",
  ),
  bullet(
    "**60-Second CEO Tour Card:** Clicking **60-sec CEO tour** in the page header (or **CEO demo walkthrough** in the sidebar) opens an interactive 6-step executive walkthrough explaining the exact moments to test during a live demonstration.",
  ),

  h2("1.2 Adaptive Light & Dark Mode Design System"),
  p(
    "The interface is built around a high-contrast **Yellow + Carbon Black + Crisp White** palette that supports both **Light Mode** and **Dark Mode** (via `<meta name=\"color-scheme\" content=\"light dark\">` and CSS `light-dark()` tokens, persisted in `localStorage` under `kova-color-scheme`):",
    { run: { size: 21 } },
  ),
  table(
    ["Semantic Token", "Dark Mode Value", "Light Mode Value", "Where It Is Used"],
    [
      [
        "**Primary Canvas & Cards**",
        "`#070709` canvas / `#111115` cards",
        "`#F6F6F2` canvas / `#FFFFFF` cards",
        "Page background, data cards, tables, modals, and drawers.",
      ],
      [
        "**Primary Brand (Yellow)**",
        "`#FACC15` / `#EAB308` with `#070709` text",
        "`#FACC15` / `#EAB308` with `#070709` text",
        "Primary CTA buttons, active segmented-control thumb, active role bar, table resize indicator.",
      ],
      [
        "**Highlights (Light Yellow)**",
        "`#FEF08A` text / `rgba(254,240,138,0.13)` fill",
        "`#713F12` text / `#FEF9C3` fill / `#FACC15` border",
        "Row hover states, split-credit/discount row highlights, figure hover states, warning pills.",
      ],
      [
        "**Errors & Negative States (Light Red)**",
        "`#FCA5A5` text / `rgba(252,165,165,0.14)` fill",
        "`#B91C1C` text / `#FEE2E2` fill / `#FCA5A5` border",
        "Negative P&L figures, post-close clawbacks, stockout badges, high return-rate bars, danger buttons.",
      ],
      [
        "**Progress & Positive (Dark Green)**",
        "`#14532D` & `#166534` fill / `#86EFAC` text",
        "`#14532D` text & bars / `rgba(20,83,45,0.11)` fill",
        "Cycle settlement progress steps, revenue waterfall bars, delivered pills, healthy return-rate indicators.",
      ],
    ],
    [1900, 2300, 2400, 2760],
  ),

  h2("1.3 Universal Interactive Primitives"),
  bullet(
    "**Zero-Compression Drill-Down Figures (`<Fig />`):** Every monetary figure backed by data is rendered as inline monospace typography with a subtle dashed underline (`border-bottom: 1.5px dashed`). Clicking **any** figure opens the **Audit Trail Drill-Down Drawer** on the right side of the screen, listing every contributing order, SKU, campaign, or staff line item that sums to that exact number.",
  ),
  bullet(
    "**Live Number Tweening & Delta Flash:** When a rule or order changes, `<Fig />` smoothly counts up or down over `320ms` (`requestAnimationFrame` cubic ease-out) and pulses dark-green (`data-flash=\"up\"`) or light-red (`data-flash=\"down\"`).",
  ),
  bullet(
    "**Adjustable Table Column Headers with Breaker Lines:** Every `<table class=\"tbl\">` renders a visible vertical breaker line on the right edge of each `<th />`. Hovering near a breaker line glows **Electric Yellow (`#FACC15`)** with a `col-resize` (`↔`) cursor. Dragging left or right widens or narrows the column live; double-clicking any breaker line resets the table's column widths.",
  ),
  bullet(
    "**Multi-Currency Display Switcher:** Located in the sidebar footer. Converts all displayed figures live between **NGN (`₦`, rate `1:1`)**, **USD (`$`, `₦1,600 = $1`)**, and **GBP (`£`, `₦2,050 = £1`)**.",
  ),
  bullet(
    "**Automatic State Persistence:** All rule changes, order transitions, discounts, returns, purchase orders, and cycle closures persist automatically in `localStorage` under `kova-payout-engine-v3` (with `SEED_VERSION = 5`). Clicking **Reset demo state** restores the clean factory seed.",
  ),

  // SECTION 2
  h1("2. Role Personas, Org Structure & Segregation of Duties"),
  p(
    "A critical flaw in naive operations dashboards is giving every user 'God Mode.' In Kova, switching roles in the sidebar (via mouse click, `↑`/`↓`/`Home`/`End` arrow keys, or `⌘K`) changes both **what you see** and **what you are permitted to do**.",
    { run: { size: 21 } },
  ),

  h2("2.1 Company Staff Directory & Base Compensation"),
  table(
    ["ID", "Full Name", "Role Tab", "Title & Scope", "Monthly Base", "Weekly Pro-Rata Base"],
    [
      ["`chidinma`", "**Chidinma Okoro**", "`founder`", "Founder & CEO", "`₦0`", "`₦0` (Owner equity)"],
      ["`amaka`", "**Amaka Obi**", "`closer`", "Sales Closer (Reports to Ngozi)", "`₦70,000`", "`₦16,154` / wk"],
      ["`chidi`", "**Chidi Nwosu**", "`closer`", "Sales Closer (Reports to Ngozi)", "`₦70,000`", "`₦16,154` / wk"],
      ["`tobi`", "**Tobi Ade**", "`buyer`", "Media Buyer · Prospecting", "`₦120,000`", "`₦27,692` / wk"],
      ["`zainab`", "**Zainab Bello**", "`buyer`", "Media Buyer · Retargeting", "`₦120,000`", "`₦27,692` / wk"],
      ["`ngozi`", "**Ngozi Eze**", "`lead`", "Sales Team Lead (1.0% override)", "`₦150,000`", "`₦34,615` / wk"],
      ["`dayo`", "**Dayo Aremu**", "`stock`", "Inventory · Lagos Warehouse", "`₦0`", "`₦0` (Ops payroll)"],
    ],
    [1100, 1650, 1100, 2410, 1400, 1700],
  ),
  p(
    "**Weekly Pro-Rata Formula:** `weeklyBase = Math.round((monthlyBase * 12) / 52)`. Across the 5 sales staff members (`Amaka`, `Chidi`, `Tobi`, `Zainab`, `Ngozi`), total weekly fixed base pay under the `Base + variable` model is `₦16,154 + ₦16,154 + ₦27,692 + ₦27,692 + ₦34,615 = ₦122,307`.",
    { run: { size: 20 } },
  ),

  h2("2.2 Strict Segregation of Duties Matrix"),
  p(
    "To prevent commission fraud (such as a closer marking their own order 'Delivered' to trigger a payout before goods leave the warehouse), Kova enforces strict role-based permissions:",
    { run: { size: 21 } },
  ),
  table(
    ["Operation / Action", "Founder (Chidinma)", "Closer (Amaka)", "Media Buyer (Tobi)", "Team Lead (Ngozi)", "Inventory (Dayo)"],
    [
      ["**Edit Payout & Operating Rules**", "YES (Full authority)", "NO (Locked + Stamp)", "NO (Locked + Stamp)", "NO (Locked + Stamp)", "NO (Locked + Stamp)"],
      ["**Close, Pay & Lock Cycles**", "YES", "NO", "NO", "NO", "NO"],
      ["**Create New Customer Lead**", "YES", "YES", "NO", "YES", "NO"],
      ["**Apply Customer Discount (`new`/`confirmed`)**", "YES", "YES (Own orders)", "NO", "YES", "NO"],
      ["**Confirm Order (`new → confirmed`)**", "YES (If stock > 0)", "YES (Own, if stock > 0)", "NO", "YES (If stock > 0)", "NO"],
      ["**Cancel Unshipped Order (`new`/`confirmed`)**", "YES", "YES (Own orders)", "NO", "YES", "NO"],
      ["**Dispatch Parcel (`confirmed → dispatched`)**", "YES", "NO (Warehouse only)", "NO", "NO", "YES"],
      ["**Mark Delivered (`dispatched → delivered`)**", "YES", "NO (Blocked: Fraud guard)", "NO", "NO", "YES"],
      ["**Mark Failed Delivery (`dispatched → cancelled`)**", "YES", "NO (Warehouse only)", "NO", "NO", "YES"],
      ["**Record COD Cash Remitted (`cashIn = true`)**", "YES", "NO", "NO", "NO", "YES"],
      ["**Process Customer Return (`delivered → returned`)**", "YES", "NO (Warehouse only)", "NO", "YES", "YES"],
      ["**Raise & Receive Purchase Orders (POs)**", "YES", "NO", "NO", "NO", "YES"],
    ],
    [2560, 1360, 1360, 1360, 1360, 1360],
  ),

  // SECTION 3
  h1("3. The 6 Payout & Operating Rules (Founder Governance Strip)"),
  p(
    "The **Payout & Operating Rules** card sits at the top of the workspace on every role tab. When viewed as **Chidinma (Founder)**, the segmented controls are interactive and display a **Founder authority** badge. When viewed as any other role, all 6 segmented controls are disabled (`.seg.locked`), and both the card subtitle and bottom lock banner display the audit trail stamp: **\"Set by the founder. Last changed 14 Mar by Chidinma O.\"** (updating dynamically to the latest timestamp whenever Chidinma edits a rule).",
    { run: { size: 21 } },
  ),
  p(
    "**Live What-If Simulator on Every Option Button:** Inside each segmented button, a secondary monospace figure (`span.wi`) previews what total cycle payroll (`sim.payout`) would be if that option were selected, and hovering the button shows a tooltip with both **Simulated payout** and **Actual net P&L**.",
    { run: { size: 21 } },
  ),

  table(
    ["Rule Name & Key", "Available Options", "Default", "Exact Mathematical & Operational Behavior"],
    [
      [
        "**1. Credit a sale on** (`creditOn`)",
        "`Lead` · `Delivery` · `Cash in`",
        "`Delivery`",
        "• **Delivery (`delivered`):** Pays `6.5%` total (`4.0%` closer, `1.5%` buyer, `1.0%` team lead) once `stage === 'delivered'`.\n• **Cash in (`cash`):** Pays the same `6.5%` pool, but **only** when `stage === 'delivered' && cashIn === true` (withholding commission on orders `#1047` and `#1050` while cash is still with the courier).\n• **Lead (`lead`):** Realistic lower rate of `2.75%` total (`1.5%` closer, `0.75%` buyer, `0.5%` lead), but credited on **every** created order immediately regardless of whether it ever ships or lands.",
      ],
      [
        "**2. When a paid order comes back** (`onReturn`)",
        "`Claw back` · `Offset next cycle` · `Absorb`",
        "`Claw back`",
        "Governs what happens when an order returns:\n• **Unpaid accrual (same cycle):** Reverses immediately under `Claw back` or `Offset`; kept by staff under `Absorb`.\n• **Post-close return (paid in prior open-window cycle like W43):** `Claw back` deducts the paid commission immediately in the current open cycle (`W44`). `Offset next cycle` schedules the deduction into the next cycle's `carryIn` when `W44` closes. `Absorb` leaves the paid commission untouched.\n• **Locked cycle (`W42`):** Always final — never clawed back under any policy.",
      ],
      [
        "**3. Two closers, one order** (`split`)",
        "`First touch` · `Last touch` · `50-50`",
        "`Last touch`",
        "Applies when `order.openedBy !== order.closer` (e.g. **Order #1053**, opened by Amaka, closed by Chidi):\n• **First touch (`first`):** `100%` of closer commission goes to `openedBy` (Amaka).\n• **Last touch (`last`):** `100%` of closer commission goes to `closer` (Chidi).\n• **50-50 (`half`):** `50%` (`2.0%`) to `openedBy` and `50%` (`2.0%`) to `closer`.",
      ],
      [
        "**4. Discount floor** (`discountFloor`)",
        "`5%` · `10%` · `15%`",
        "`10%`",
        "1. Commission is **always** calculated on the discounted price `orderValue = round(list * (1 - discount))`, never list price.\n2. If `order.discount > discountFloor`, the closer's commission rate on that order is **halved (`× 0.5`)** (e.g., **Order #1049** has a `15%` discount above the `10%` floor, cutting Amaka's closer rate from `4.0%` to `2.0%`).",
      ],
      [
        "**5. Return-rate quality gate** (`returnCap`)",
        "`Off` · `30% cap` · `20% cap`",
        "`Off` (`100%`)",
        "Calculates each closer's resolved return rate across all cycles: `returned / (delivered + returned)`.\n• Amaka is at `37.5%` (`3` returned / `8` resolved); Chidi is at `14.3%` (`1` returned / `7` resolved).\n• When set to `30% cap` or `20% cap`, any closer whose return rate exceeds the cap has their commission halved (`× 0.5`) across the cycle (stacking with the discount guardrail down to `0.25×` if both are breached).",
      ],
      [
        "**6. Pay structure** (`payModel`)",
        "`Commission only` · `Base + variable`",
        "`Base + variable`",
        "• **Base + variable (`base_plus`):** Folds weekly pro-rated base salaries (`₦122,307/wk`) into staff payslips and P&L payroll. Target payroll ceiling = `35%` of delivered revenue.\n• **Commission only (`commission`):** Zero base pay (`₦0`); staff earn variable commission only. Target payroll ceiling = `10%`.",
      ],
    ],
    [1800, 1500, 1100, 4960],
  ),

  // SECTION 4
  h1("4. True Operating P&L Engine & Financial Formulas"),
  p(
    "The **Founder & CEO View** opens with the **Executive Reality Check Headline** and the **True Operating P&L Waterfall**. Below are the exact mathematical formulas and initial seed values for active cycle **W44** under the default rules (`Delivery`, `Claw back`, `Last touch`, `10%` discount floor, Quality gate `Off`, `Base + variable`).",
    { run: { size: 21 } },
  ),

  h2("4.1 The Three Net Figures Compared in the Headline Banner"),
  table(
    ["Metric Name", "Formula", "Initial W44 Value", "Executive Interpretation"],
    [
      [
        "**1. Naive 'Net after commission'**",
        "`Delivered Revenue − Variable Commission`",
        "`+₦418,412`",
        "The dangerous illusion reported by basic sales trackers (`₦447,500 − ₦29,088`). Makes the week look wildly profitable while the business is actually underwater.",
      ],
      [
        "**2. Core Actual (4-Line Check)**",
        "`Delivered Revenue − COGS − Variable Commission − Ad Spend`",
        "`−₦85,088`",
        "The immediate founder reality check (`₦447,500 − ₦222,500 − ₦29,088 − ₦281,000 = −₦85,088`). Shows the business is losing `₦85,088` before fixed overhead and logistics.",
      ],
      [
        "**3. Full Operating Net (`pnl.actual`)**",
        "`Delivered Revenue − Prior Refunds − COGS − Write-offs − Commission − Weekly Base − Ad Spend − Courier Legs`",
        "`−₦231,895`",
        "The complete bottom line after deducting weekly pro-rated sales base (`₦122,307`) and `₦3,500` courier leg fees (`₦24,500`).",
      ],
    ],
    [2200, 2600, 1460, 3100],
  ),

  h2("4.2 All 8 Lines of the True Operating P&L Waterfall (`W44`)"),
  table(
    ["Waterfall Line", "Sign", "Default W44 Amount", "Exact Derivation & Contributing Seed Records"],
    [
      [
        "**Delivered revenue** (`revenue`)",
        "`+`",
        "`₦447,500`",
        "Sum of `orderValue(o)` for all orders delivered in `W44` (`stage === 'delivered'`): `#1041` (`₦128,000`) + `#1042` (`₦64,500`) + `#1044` (`₦45,000`) + `#1047` (`₦152,000`) + `#1050` (`₦58,000`) = `₦447,500`.",
      ],
      [
        "**Prior-cycle refunds** (`refunds`)",
        "`−`",
        "`₦0` (Until triggered)",
        "Sum of `orderValue(o)` for orders delivered in a prior cycle (`W42`/`W43`) that are returned during `W44` (`reversedCycle === 'W44'`). Returning `#1033` adds `−₦198,000` here.",
      ],
      [
        "**Cost of goods (COGS)** (`cogs`)",
        "`−`",
        "`₦222,500`",
        "Unit cost × quantity for all `W44` delivered orders, minus unit cost of resellable prior-cycle returns: `#1041` (`AIR-12 ×1 = ₦78k`) + `#1042` (`KET-03 ×2 = ₦39k`) + `#1044` (`KET-03 ×1 = ₦19.5k`) + `#1047` (`STM-09 ×1 = ₦52k`) + `#1050` (`BLN-07 ×1 = ₦34k`) = `₦222,500`.",
      ],
      [
        "**Damaged write-offs** (`writeoffs`)",
        "`−`",
        "`₦0` (Until triggered)",
        "Unit cost × quantity for orders returned in `W44` with warehouse inspection condition set to **Damaged in transit** (`returnCondition === 'damaged'`).",
      ],
      [
        "**Variable commission** (`commission`)",
        "`−`",
        "`₦29,088` (`6.5%`)",
        "Sum of variable commission + post-close clawback adjustments in `W44` (`6.5% × ₦447,500 = ₦29,087.50`, rounded to `₦29,088`).",
      ],
      [
        "**Fixed base pay** (`base`)",
        "`−`",
        "`₦122,307`",
        "Weekly pro-rated base salary across the 5 sales staff (`Amaka ₦16,154`, `Chidi ₦16,154`, `Tobi ₦27,692`, `Zainab ₦27,692`, `Ngozi ₦34,615`). Drops to `₦0` if Pay Structure is switched to `Commission only`.",
      ],
      [
        "**Meta ad spend** (`adSpend`)",
        "`−`",
        "`₦281,000`",
        "Cycle `W44` campaign spend: **Tobi Ade · Prospecting** (`₦185,000`) + **Zainab Bello · Retargeting** (`₦96,000`) = `₦281,000`.",
      ],
      [
        "**Courier leg fees** (`logistics`)",
        "`−`",
        "`₦24,500`",
        "`₦3,500` per physical courier trip: `1` leg for dispatched/delivered/failed-delivery orders (`5` delivered in `W44` = `5` legs) + `2` legs (outbound + return trip) for returned orders (`#1046` returned in `W44` = `2` legs). Total = `7 legs × ₦3,500 = ₦24,500`.",
      ],
    ],
    [2100, 660, 1600, 5000],
  ),

  // SECTION 5
  h1("5. Payout Cycle Lifecycle, Clawbacks & Negative Payslip Protection"),
  p(
    "Everything in Kova is anchored to a weekly payout cycle (`CycleBar.tsx`). Instead of commissions floating in an endless 'accrued' state forever, the founder progresses cycles through a strict 4-stage state machine:",
    { run: { size: 21 } },
  ),
  table(
    ["Cycle Stage", "Badge Tone", "Progress Bar", "What Happens & What Actions Are Available"],
    [
      [
        "**1. Accruing (`open`)**",
        "Info (`Accruing`)",
        "`1 / 4` dark-green bars",
        "Live calculation window (currently **W44 · 26 Oct – 1 Nov**). Every rule toggle or order transition updates payslips live. Founder sees the **Close & approve W44** button.",
      ],
      [
        "**2. Approved (`approved`)**",
        "Light Yellow (`Approved`)",
        "`2 / 4` dark-green bars",
        "Triggered when the founder clicks **Close & approve**. Freezes the cycle's payout lines (`c.lines`), snapshots the cycle's P&L (`c.pnl`), calculates any negative payslip carry-forwards (`carryOut`), and automatically opens the next cycle (**W45**). Founder can now click **Mark paid**.",
      ],
      [
        "**3. Paid (`paid`)**",
        "Dark Green (`Paid`)",
        "`3 / 4` dark-green bars",
        "Cash has been disbursed to staff bank accounts (currently **W43 · 19 Oct – 25 Oct**). The post-close return window is still open: if a `W43` order (like `#1033`) returns now, `Claw back` deducts the commission from `W44` payslips, or `Offset next cycle` schedules it into `W45`. Founder can click **Lock cycle**.",
      ],
      [
        "**4. Locked (`locked`)**",
        "Neutral (`Locked`)",
        "`4 / 4` dark-green bars",
        "Accounting books are closed (currently **W42 · 12 Oct – 18 Oct**). If a `W42` order (like `#1024`) returns after lock, the commission is **kept (final)** under all return rules so historical payroll is never mutated.",
      ],
    ],
    [1800, 1400, 1500, 4660],
  ),

  h2("5.1 Negative Payslip Protection & Carry-Forward (`payslip()`)"),
  bullet(
    "For each sales person, `gross = base + commission + adjustments + carry`.",
  ),
  bullet(
    "If post-close clawbacks exceed a staff member's earnings in a cycle (`gross < 0`, which happens under `Commission only` when a large prior-cycle order returns), `payable` is floored at **`₦0`** (`Math.max(0, Math.round(gross))`) — because you cannot send a negative bank transfer.",
  ),
  bullet(
    "The unpaid deficit (`carryOut = Math.round(gross)`) is automatically carried forward into the next cycle's `carryIn` array when the cycle closes, ensuring the company recovers the balance from future earnings.",
  ),

  h2("5.2 One-Click Bank Payout CSV Export"),
  bullet(
    "Every cycle card (`W42`, `W43`, `W44`) has a **Bank CSV** button that generates and downloads `kova-payouts-<cycleId>.csv` with columns: `Cycle, Status, Staff ID, Name, Role, Base (NGN), Variable Commission (NGN), Clawbacks & Adjustments (NGN), Prior Carry (NGN), Net Payable (NGN), Carry To Next Cycle (NGN)`.",
  ),

  // SECTION 6
  h1("6. Role-by-Role Screen & Component Specifications"),

  h2("6.1 Founder & CEO View (`Chidinma Okoro`)"),
  bullet(
    "**Executive Reality Check Banner (`.headline`):** Displays the live commission ratio (`6.5%`), the net operating loss (`−₦231,895`), narrative links to every cost driver, and 4 comparison cards (`Naive 'Net after commission'`, `Core actual`, `Full operating net`, and `Total payroll %`).",
  ),
  bullet(
    "**5 Founder KPI Tiles (`.tiles`):** `Delivered revenue` (`₦447,500`), `Cash still with courier` (`₦210,000` from `#1047` and `#1050`), `Paid on undelivered orders` (`₦0` under Delivery, jumps to `₦24,571` under Lead), `Commission kept on returns / Scheduled next-cycle offsets`, and `SKUs needing reorder` (`3` SKUs: `AIR-12`, `KET-03`, `VAC-21`).",
  ),
  bullet(
    "**True Operating P&L Waterfall & Payout Ratio Meter:** Visual horizontal bar chart of all 8 P&L lines plus a segmented progress meter comparing `Variable commission` (yellow) + `Fixed base pay` (dark green) against the target ceiling (`35%` for `Base + variable`, `10%` for `Commission only`).",
  ),
  bullet(
    "**Closer Quality, Return Gate & Net Contribution Scorecard (`CloserScorecard.tsx`):** Side-by-side table auditing **Amaka Obi** vs **Chidi Nwosu** on `Delivered vol.`, `Return rate` (with visual progress bar and `High risk` / `½ rate gate` / `Healthy` pills), `Avg discount`, `Cycle pay`, and **Net margin contrib.** (after COGS, courier legs, damaged write-offs, and closer commission).",
  ),
  bullet(
    "**Full Visibility:** The Founder tab also renders the **Payout Cycles & Settlement** bar, the full **Order Ledger** table, the **Warehouse Stock Book & SKU Unit Economics** tables, and the **Immutable Audit & Event Log**.",
  ),

  h2("6.2 Closer Phone-First Console (`Amaka Obi`)"),
  bullet(
    "**Designed for a 390px Smartphone Screen in Lagos Traffic:** Verified at `390×844` viewport with zero horizontal scroll (`scrollWidth === 390px`).",
  ),
  bullet(
    "**Phone Hero Banner (`.phone-hero`):** Shows `Delivery certified by Warehouse` lock badge, Amaka's live **Net take-home accruing this week** (`₦27,354`), and a 3-column split (`Weekly Base: ₦16,154`, `Commission: ₦11,200`, `Clawbacks / Carry: ₦0`).",
  ),
  bullet(
    "**4 Personal Closer Tiles:** `In your open pipeline` (`₦28,020` potential commission if open orders land), `Your return rate` (`38%` — `3 returned out of 8 resolved`), `Discounted orders` (`1`), and `Stock-blocked orders` (`2` orders waiting on warehouse PO).",
  ),
  bullet(
    "**Stacked Mobile Order Cards (`.ocard`):** Replaces the wide desktop table with vertical cards showing Order ID, customer, city, SKU, list vs discounted price, stage pills, **Your closer share**, a yellow warehouse lock note (`Only Warehouse (Dayo) can mark dispatched parcels delivered or returned`), and allowed closer action buttons (`Confirm order`, `Discount`, `Cancel`).",
  ),

  h2("6.3 Media Buyer View (`Tobi Ade`)"),
  bullet(
    "**5 Media Buyer KPI Tiles:** `Net payout this cycle` (`₦32,470`), `Campaign ad spend` (`₦185,000`), `Delivered revenue` (`₦216,500`), `ROAS on delivery` (`1.17×` vs booked ROAS `6.70×`), and `Campaign net margin` (`−₦99,778` after COGS, ad spend, courier legs, and commission).",
  ),
  bullet(
    "**Campaign Economics Table:** Compares **Tobi Ade (Prospecting)** and **Zainab Bello (Retargeting)** across `Ad spend`, `Booked vol.`, `Booked ROAS`, `Delivered rev.`, `Delivered ROAS`, `Net margin (after COGS)`, and `Cycle pay`. Demonstrates why media buyers celebrating `6.70×` booked ROAS are actually losing money when orders fail to deliver.",
  ),

  h2("6.4 Sales Team Lead View (`Ngozi Eze`)"),
  bullet(
    "**4 Team Lead KPI Tiles:** `Team lead net payout` (`₦39,090` = `₦34,615` base + `₦4,475` 1.0% override), `Override commission` (`₦4,475`), `Team delivered volume` (`₦447,500`), and `Split-credit orders` (`1` order — `#1053`).",
  ),
  bullet(
    "**Closer Quality Scorecard:** Gives Ngozi full visibility into Amaka and Chidi's return rates, discount habits, and net margin contributions.",
  ),

  h2("6.5 Warehouse & Inventory View (`Dayo Aremu`)"),
  bullet(
    "**5 Warehouse KPI Tiles:** `SKUs needing reorder` (`3`), `Units committed` (`7` units reserved across confirmed/dispatched orders), `Stock on hand (at cost)` (`₦1,419,000`), `Open POs inbound` (`₦0` initially), and `Restocked from returns` (`4` resellable units).",
  ),
  bullet(
    "**Actionable Stock Alert Banner:** Highlights `AIR-12: 1 avail, KET-03: 2 avail, VAC-21: 0 avail` with a 1-click **Raise POs for all (3)** button. Raising POs moves units into `On order` with supplier ETAs (`leadDays`), recalculates `Projected = Available + On order`, and flips the banner to a dark-green **Stock loop closed** confirmation.",
  ),
  bullet(
    "**Warehouse Stock Book Table:** Columns for `SKU`, `Product`, `On hand`, `Committed`, `Available`, `On order`, `Projected`, `Reorder at`, `Status` (`Out of stock`, `Reorder now`, `PO inbound`, `Healthy`), `Value at cost`, and per-SKU **Raise PO (+qty)** / **Receive PO** buttons.",
  ),
  bullet(
    "**Purchase Order Register Table:** Appears automatically once POs are raised, showing `PO #`, `SKU`, `Qty`, `Committed cost`, `Raised by & timestamp`, `ETA`, `Status` (`In transit` / `Received`), and a **Receive stock** button that increments `onHand` and unblocks stock-blocked orders like `#1051`.",
  ),
  bullet(
    "**SKU Unit Economics & Return Bleed Table:** Audits all 5 SKUs across all cycles (`Landed qty`, `Return rate`, `Delivered rev.`, `Unit COGS`, `Courier & write-offs`, `Commission`, and clickable `Net SKU profit`).",
  ),

  // SECTION 7
  h1("7. Complete Seed Data Reference (SKUs & Orders)"),

  h2("7.1 All 5 Product SKUs (`products`)"),
  table(
    ["SKU", "Product Name", "Unit Cost (COGS)", "Typical List Price", "On Hand", "Committed (W44)", "Available", "Reorder Point", "Lead Time"],
    [
      ["`AIR-12`", "Air fryer 5.5L", "`₦78,000`", "`₦198,000`", "`4`", "`3` (`#1043,#1049,#1041*`)", "`2` (Reorder)", "`3`", "`7 days`"],
      ["`BLN-07`", "Blender Pro 1200W", "`₦34,000`", "`₦73,500`", "`11`", "`1` (`#1053`)", "`10` (Healthy)", "`4`", "`5 days`"],
      ["`KET-03`", "Electric kettle 1.7L", "`₦19,500`", "`₦42,000`", "`2`", "`0`", "`2` (Reorder)", "`5`", "`4 days`"],
      ["`VAC-21`", "Handheld vacuum", "`₦96,000`", "`₦185,000`", "`2`", "`2` (`#1045 ×2`)", "`0` (Out of stock)", "`3`", "`10 days`"],
      ["`STM-09`", "Garment steamer", "`₦52,000`", "`₦112,000`", "`9`", "`1` (`#1052`)", "`8` (Healthy)", "`3`", "`6 days`"],
    ],
    [950, 1650, 1150, 1150, 800, 1360, 1000, 700, 600],
  ),

  h2("7.2 Key Seed Orders Designed for Specific Demo Scenarios"),
  p(
    "The seed contains **25 orders** across `W42` (`#1021–#1028`, Locked), `W43` (`#1031–#1038`, Paid), and `W44` (`#1041–#1053`, Open). The table below highlights the specific orders crafted to prove each operational rule:",
    { run: { size: 21 } },
  ),
  table(
    ["Order #", "Cycle", "Customer & City", "SKU & Value", "Stage & Flags", "What Scenario This Order Demonstrates"],
    [
      [
        "`#1024`",
        "`W42` (Locked)",
        "Halima Sani (Abuja)",
        "`STM-09 ×1` (`₦98,000`)",
        "`delivered`, paid in `W42`",
        "**Post-Lock Return Finality:** Filter by `Paid in W42/W43` and return `#1024`. Because `W42` is **Locked**, the `₦6,370` commission is **kept** even under `Claw back`.",
      ],
      [
        "`#1033`",
        "`W43` (Paid)",
        "Kelechi Nnaji (Abuja)",
        "`AIR-12 ×1` (`₦198,000`)",
        "`delivered`, paid in `W43`",
        "**Post-Close Clawback vs Offset:** Paid in `W43` (`₦12,870` total commission). Returning `#1033` in `W44` claws back `−₦12,870` immediately in `W44` (or schedules a `W45` offset).",
      ],
      [
        "`#1045`",
        "`W44` (Open)",
        "Ifeoma Chukwu (Enugu)",
        "`VAC-21 ×2` (`₦318,000`)",
        "`confirmed`",
        "**Stock Reservation:** Reserves all `2` on-hand units of `VAC-21`, reducing `VAC-21` available stock to `0`.",
      ],
      [
        "`#1047` & `#1050`",
        "`W44` (Open)",
        "Ngozi Okonkwo & Chinedu Eze",
        "`STM-09` (`₦152k`) & `BLN-07` (`₦58k`)",
        "`delivered`, `cashIn: false`",
        "**COD Cash Still With Courier (`₦210,000`):** Marked delivered by courier, but cash hasn't hit the bank. Switching trigger to `Cash in` withholds commission until **Cash remitted** is clicked.",
      ],
      [
        "`#1048`",
        "`W44` (Open)",
        "Tunde Bakare (Lagos)",
        "`BLN-07 ×1` (`₦73,500`)",
        "`new`",
        "**Interactive Discount Guardrail Test:** Click **Discount** on `#1048` to test `0%`, `5%`, `10%`, `15%`, and `20%` discounts and watch the closer rate halve above the floor.",
      ],
      [
        "`#1049`",
        "`W44` (Open)",
        "Hauwa Ibrahim (Abuja)",
        "`AIR-12 ×1` (`₦208,250` after `15%` off `₦245k`)",
        "`confirmed`, `discount: 15%`",
        "**Pre-Seeded Guardrail Breach:** Amaka discounted `#1049` by `15%` (past the `10%` floor). Her closer rate on `#1049` is halved from `4.0%` to `2.0%` (`½ rate` badge).",
      ],
      [
        "`#1051`",
        "`W44` (Open)",
        "Aisha Lawal (Kano)",
        "`VAC-21 ×1` (`₦187,000`)",
        "`new` (Stock-blocked)",
        "**Inventory-to-Sales Guardrail:** Trying to click **Confirm order** on `#1051` is blocked with a toast error because `VAC-21` has `0` available units until Dayo raises & receives a PO.",
      ],
      [
        "`#1053`",
        "`W44` (Open)",
        "Kemi Adebayo (Ibadan)",
        "`BLN-07 ×1` (`₦88,000`)",
        "`dispatched`, `openedBy: amaka`, `closer: chidi`",
        "**Split-Touch Attribution:** Opened by Amaka and closed by Chidi. Toggling **First touch · Last touch · 50-50** re-routes the closer commission between Amaka and Chidi.",
      ],
    ],
    [950, 1050, 1500, 1450, 1350, 3060],
  ),

  // SECTION 8
  h1("8. Interactive Modals, Drawers & Overlays (`Overlays.tsx`)"),
  bullet(
    "**1. Audit Trail Drill-Down Drawer (`DrillDrawer`):** Slides in from the right (`@starting-style` transition) whenever any `<Fig />` is clicked. Shows the metric title, subtitle, total formatted figure, and a line-by-line list (`ref` badge, `label`, `detail`, and signed `amount`), plus total line count in the footer. Dismiss via `Esc`, the `X` button, or clicking the backdrop scrim.",
  ),
  bullet(
    "**2. Discount Guardrail Modal (`DiscountDialog`):** Opens when clicking **Discount** on a `new` or `confirmed` order. Features a 5-option spring-animated segmented control (`0%`, `5%`, `10%`, `15%`, `20%`) showing `full rate` vs `½ rate` on each option, and a live 4-row calculator (`List price`, `Customer pays`, `Closer commission rate`, and `Closer commission on this order` vs list).",
  ),
  bullet(
    "**3. Return Inspection & Reversal Modal (`ReturnDialog`):** Opens when clicking **Process return** on a `delivered` order. Requires selecting the warehouse inspection condition:\n  • **Resellable · Return to shelf:** Increments available stock (`+qty`) and charges only the `₦3,500` return courier leg.\n  • **Damaged in transit · Write off COGS:** Does not increment stock and writes off `unitCost × qty` on the P&L (`Damaged write-offs`).\n  Also previews the exact **Commission consequence** based on whether the order was credited in the current open cycle, a paid cycle (`W43`), or a locked cycle (`W42`).",
  ),
  bullet(
    "**4. Live Lead Intake Modal (`NewOrderDialog`):** Opens when clicking **+ New lead** in the Order Ledger or Command Palette. Allows creating a live order with custom `Customer name`, `Delivery city` (`Lagos`, `Abuja`, `Port Harcourt`, `Ibadan`, `Enugu`, `Kano`), `Product SKU`, `Quantity (1–3)`, `Opened by (First touch)`, `Closed by (Last touch)`, and `Campaign / Media buyer`, while previewing warehouse availability and total commission pool.",
  ),
  bullet(
    "**5. Quick Command Palette (`CommandPalette` — `⌘K` / `Ctrl+K`):** Keyboard-driven spotlight modal with instant search filter to switch themes (`Light`, `Dark`, `System`), jump to any role persona, create a new lead, toggle any founder rule, close the active payout cycle, or reset demo state.",
  ),
  bullet(
    "**6. Immutable Audit & Event Log (`AuditLogCard`) & Toast Tray (`ToastTray`):** Every state mutation appends a timestamped entry to the Audit Log with the actor's avatar, role, cycle ID, description, and signed P&L/payout delta pills (`Actual net: −₦14,622`, `Team payout: +₦14,622`), while firing a color-coded toast notification (`ok` dark green, `warn` yellow, `err` light red) in the bottom-right corner.",
  ),

  // SECTION 9
  h1("9. Codebase File Map & Verification Suite"),
  table(
    ["File Path", "Responsibility"],
    [
      ["`app/layout.tsx`", "Next.js RootLayout, Geist Sans & Mono fonts, `<meta name=\"color-scheme\" content=\"light dark\">`, and FOUC prevention script."],
      ["`app/globals.css`", "Adaptive Light/Dark mode design tokens (`light-dark()`), fixed collapsible sidebar, spotlight cards, spring segmented controls, and resizable table headers."],
      ["`lib/types.ts`", "Strict TypeScript interfaces for `Role`, `Stage`, `CreditOn`, `OnReturn`, `SplitRule`, `PayModel`, `Rules`, `Order`, `Cycle`, `PayLine`, `PurchaseOrder`, `Drill`, and `PnL`."],
      ["`lib/engine.ts`", "Pure, zero-React calculation and mutation engine (`computePnl`, `commissionLines`, `payslip`, `whatIf`, `applyOrderAction`, `closeCycle`, `raisePO`, `receivePO`, `payoutCsv`)."],
      ["`lib/seed.ts`", "Deterministic factory seed (`SEED_VERSION = 5`) replaying cycles `W42` (Locked), `W43` (Paid), and `W44` (Open) through the engine."],
      ["`lib/rules.ts`", "Metadata and dynamic explanations for the 6 payout and operating rules."],
      ["`lib/store.ts`", "Zustand reactive store with `localStorage` persistence (`kova-payout-engine-v3`) and action dispatchers."],
      ["`components/App.tsx`", "Application shell, fixed collapsible sidebar, WAI-ARIA role tabs, directional View Transitions, top utility bar, and walkthrough guide."],
      ["`components/ui.tsx`", "Reusable primitives: `<Fig />` (number tweening + drill trigger), `<Tile />`, `<Card />` (pointer spotlight), `<StagePill />`, and `useTableColumnResize()`."],
      ["`components/RulesStrip.tsx`", "6-rule governance strip with live what-if payout badges, spring-animated active thumb, role lock, and founder audit stamps."],
      ["`components/FounderView.tsx`", "Founder Reality Check banner, 5 KPI tiles, True Operating P&L Waterfall, and Payout Ratio Meter."],
      ["`components/CloserScorecard.tsx`", "Closer quality, return-rate gate, discount average, and net margin contribution table."],
      ["`components/CloserView.tsx`", "390px phone-first closer hero console, personal pipeline tiles, and stock-block alert."],
      ["`components/BuyerLeadViews.tsx`", "Media Buyer (`BuyerView`) ROAS vs net margin table and Sales Team Lead (`LeadView`) override console."],
      ["`components/CycleBar.tsx`", "4-stage payout cycle cards (`Accrued → Approved → Paid → Locked`) and 1-click Bank CSV export."],
      ["`components/OrderLedger.tsx`", "Filterable, searchable order ledger (renders stacked `.ocard` cards for Closer and resizable `.tbl` table for other roles)."],
      ["`components/StockBook.tsx`", "Warehouse Stock Book, Reorder Alert loop, Purchase Order Register, and SKU Unit Economics table."],
      ["`components/Overlays.tsx`", "`DrillDrawer`, `DiscountDialog`, `ReturnDialog`, `NewOrderDialog`, `CommandPalette`, `AuditLogCard`, and `ToastTray`."],
      ["`scripts/verify.ts`", "Automated 10-invariant mathematical verification suite (`npm.cmd run verify`)."],
      ["`scripts/e2e.mjs`", "Automated 10-scenario headless Chrome E2E test suite verifying DOM, 390px mobile layout, modals, and persistence."],
    ],
    [2600, 6760],
  ),
];

const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    ${bodyElements.join("\n")}
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1080" w:right="1440" w:bottom="1080" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;

const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>
        <w:sz w:val="21"/>
        <w:szCs w:val="21"/>
        <w:color w:val="18181B"/>
      </w:rPr>
    </w:rPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:qFormat/>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:basedOn w:val="Normal"/>
    <w:next w:val="Normal"/>
    <w:qFormat/>
    <w:pPr>
      <w:keepNext/>
      <w:pBdr>
        <w:bottom w:val="single" w:sz="12" w:space="4" w:color="FACC15"/>
      </w:pBdr>
    </w:pPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="heading 2"/>
    <w:basedOn w:val="Normal"/>
    <w:next w:val="Normal"/>
    <w:qFormat/>
    <w:pPr><w:keepNext/></w:pPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading3">
    <w:name w:val="heading 3"/>
    <w:basedOn w:val="Normal"/>
    <w:next w:val="Normal"/>
    <w:qFormat/>
    <w:pPr><w:keepNext/></w:pPr>
  </w:style>
</w:styles>`;

const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;

const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const docRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

const zipBuffer = buildZip([
  { name: "[Content_Types].xml", data: contentTypesXml },
  { name: "_rels/.rels", data: rootRelsXml },
  { name: "word/_rels/document.xml.rels", data: docRelsXml },
  { name: "word/styles.xml", data: stylesXml },
  { name: "word/document.xml", data: documentXml },
]);

const outPaths = [
  "C:\\Users\\K-LEE\\Desktop\\Projects\\kova-payout-engine\\Kova_Payout_Engine_Full_Specification_and_Guide.docx",
  "C:\\Users\\K-LEE\\Downloads\\Kova_Payout_Engine_Full_Specification_and_Guide.docx",
  "C:\\Users\\K-LEE\\.gemini\\antigravity\\scratch\\kova-payout-engine\\Kova_Payout_Engine_Full_Specification_and_Guide.docx",
];

for (const p of outPaths) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, zipBuffer);
  console.log(`Wrote ${zipBuffer.length} bytes to ${p}`);
}

