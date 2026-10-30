import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9229;
const URL = "http://localhost:3000";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const proc = spawn(
  CHROME,
  [
    `--remote-debugging-port=${PORT}`,
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    `--user-data-dir=${path.join(os.tmpdir(), "kova-e2e-chrome")}`,
    "--window-size=1440,900",
    URL,
  ],
  { stdio: "ignore" },
);

async function getWsUrl() {
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const tabs = await res.json();
      const page = tabs.find((t) => t.type === "page" && t.url.includes("localhost:3000")) || tabs.find((t) => t.type === "page");
      if (page?.webSocketDebuggerUrl) {
        console.log("Connected to tab:", page.url);
        return page.webSocketDebuggerUrl;
      }
    } catch {}
    await sleep(300);
  }
  throw new Error("Could not connect to headless Chrome");
}

try {
  const wsUrl = await getWsUrl();
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = rej;
  });

  let seq = 0;
  const pending = new Map();
  const errors = [];

  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    }
    if (msg.method === "Runtime.exceptionThrown") {
      errors.push(
        msg.params.exceptionDetails.exception?.description ||
          msg.params.exceptionDetails.text,
      );
    }
    if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") {
      errors.push(msg.params.args.map((a) => a.value || a.description).join(" "));
    }
  };

  function send(method, params = {}) {
    const id = ++seq;
    ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
  }

  async function evaluate(expr) {
    const r = await send("Runtime.evaluate", {
      expression: `(() => { ${expr} })()`,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.exceptionDetails) {
      throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    }
    return r.result.value;
  }

  await send("Runtime.enable");
  await send("Page.enable");
  await send("Page.navigate", { url: URL });

  // Wait for hydration
  for (let i = 0; i < 60; i++) {
    const ready = await evaluate(`return Boolean(document.querySelector(".headline h2") || document.querySelector(".side-btn"));`);
    if (ready) break;
    await sleep(300);
  }
  await evaluate(`
    const resetBtn = Array.from(document.querySelectorAll(".side-btn")).find(b => b.innerText.includes("Reset demo state"));
    if (resetBtn) resetBtn.click();
  `);
  await sleep(150);
  const debugHtml = await evaluate(`return { url: location.href, title: document.title, text: document.body?.innerText?.slice(0, 300) };`);
  console.log("Page state:", debugHtml, "Errors:", errors);

  // 0. Light by default even when the browser prefers dark; the toggle works and only saves on an explicit click
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }] });
  await evaluate(`localStorage.removeItem("kova-color-scheme");`);
  await send("Page.reload");
  for (let i = 0; i < 40 && !(await evaluate(`return Boolean(document.querySelector(".theme-toggle"));`)); i++) await sleep(250);
  const theme0 = await evaluate(`
    return {
      theme: document.documentElement.dataset.theme,
      saved: localStorage.getItem("kova-color-scheme"),
      bg: getComputedStyle(document.body).backgroundColor,
      scheme: getComputedStyle(document.documentElement).colorScheme,
    };
  `);
  const lum = (css) => css.match(/\d+/g).slice(0, 3).map(Number).reduce((a, b) => a + b, 0) / 3;
  assert.equal(theme0.theme, "light", "Must start light when the browser prefers dark");
  assert.equal(theme0.saved, null, "Default theme must not be saved as a user choice");
  assert.equal(theme0.scheme, "light");
  assert.ok(lum(theme0.bg) > 200, "Page background should be light, got " + theme0.bg);
  await evaluate(`document.querySelector(".theme-toggle").click();`);
  await sleep(300);
  const theme1 = await evaluate(`return { theme: document.documentElement.dataset.theme, saved: localStorage.getItem("kova-color-scheme"), bg: getComputedStyle(document.body).backgroundColor, cs: getComputedStyle(document.documentElement).colorScheme, bgVar: getComputedStyle(document.documentElement).getPropertyValue("--bg"), metas: Array.from(document.querySelectorAll("meta[name=color-scheme]")).map(m => m.content) };`);
  assert.equal(theme1.theme, "dark", "Toggle switches to dark");
  assert.equal(theme1.saved, "dark", "Explicit choice is saved");
  assert.equal(theme1.cs, "dark", "Computed color-scheme switches to dark");
  // Compare the resolved --bg token, not the painted pixel: the body has a 220ms colour transition that headless Chrome can leave mid-fade.
  const hex = theme1.bgVar.trim().replace("#", "");
  const lumHex = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)).reduce((x, y) => x + y, 0) / 3;
  assert.ok(lumHex < 40, "Dark --bg token should be dark, got " + theme1.bgVar);
  await send("Page.reload");
  for (let i = 0; i < 40 && !(await evaluate(`return Boolean(document.querySelector(".theme-toggle"));`)); i++) await sleep(250);
  const theme2 = await evaluate(`return document.documentElement.dataset.theme;`);
  assert.equal(theme2, "dark", "Saved dark choice survives a reload");
  await evaluate(`document.querySelector(".theme-toggle").click();`);
  await sleep(200);
  await evaluate(`localStorage.removeItem("kova-color-scheme");`);
  await send("Emulation.setEmulatedMedia", { features: [] });
  console.log("✓ [0] Light by default despite a dark browser preference; toggle works; only an explicit click saves");

  // 1. Founder view & P&L headline
  const headlineText = await evaluate(`return document.querySelector(".headline h2")?.innerText;`);
  assert.ok(headlineText && headlineText.includes("losing"), `Headline should show loss: ${headlineText}`);
  console.log("✓ [1/10] Founder view rendered with executive P&L headline:", headlineText);

  // 2. Drill-down modal on clicking figure
  await evaluate(`
    document.querySelector(".headline .fig").click();
  `);
  await sleep(150);
  const drawerTitle = await evaluate(`return document.querySelector(".drawer h2")?.innerText;`);
  assert.ok(drawerTitle, "Drill-down drawer should open when clicking a figure");
  console.log("✓ [2/10] Drill-down drawer opened:", drawerTitle);
  // Close drawer
  await evaluate(`document.querySelector('.drawer button[aria-label="Close drill-down"]').click();`);
  await sleep(100);

  // 3. Rule toggle & live recalculation
  const beforeHeadline = await evaluate(`return document.querySelector(".headline h2")?.innerText;`);
  await evaluate(`
    const btn = Array.from(document.querySelectorAll(".seg button")).find(b => b.innerText.startsWith("Lead"));
    btn.click();
  `);
  await sleep(150);
  const afterHeadline = await evaluate(`return document.querySelector(".headline h2")?.innerText;`);
  assert.notEqual(beforeHeadline, afterHeadline, "Switching trigger to Lead recalculates P&L headline");
  console.log("✓ [3/10] Switching rule to 'Lead' recalculated live:", afterHeadline);

  // Switch back to Delivery
  await evaluate(`
    const btn = Array.from(document.querySelectorAll(".seg button")).find(b => b.innerText.startsWith("Delivery"));
    btn.click();
  `);
  await sleep(100);

  // 4. Switch to Closer role & verify rules are locked + stamp shown + phone cards rendered
  await evaluate(`document.querySelector('#tab-closer').click();`);
  await sleep(150);
  const closerChecks = await evaluate(`
    const segLocked = document.querySelectorAll(".seg.locked").length;
    const disabledBtns = document.querySelectorAll(".seg button:disabled").length;
    const banner = document.querySelector(".lock-banner")?.innerText || "";
    const cards = document.querySelectorAll(".ocard").length;
    return { segLocked, disabledBtns, banner, cards };
  `);
  assert.equal(closerChecks.segLocked, 5, "All 5 rule groups must have .locked class for closer");
  assert.ok(closerChecks.disabledBtns >= 12, "All rule buttons must be disabled for closer");
  assert.ok(closerChecks.banner.includes("Set by the founder"), "Lock banner must display founder audit message");
  assert.ok(closerChecks.cards > 0, "Closer view must render stacked order cards (.ocard)");
  console.log(`✓ [4/10] Closer view: ${closerChecks.segLocked} locked rules, ${closerChecks.cards} phone order cards, banner="${closerChecks.banner}"`);

  // 5. Mobile 390px horizontal overflow check on Closer view
  await send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await sleep(200);
  const overflow390 = await evaluate(`
    return {
      innerWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
    };
  `);
  assert.ok(
    overflow390.scrollWidth <= overflow390.innerWidth + 1,
    `Closer view at 390px should not overflow horizontally (scrollWidth=${overflow390.scrollWidth}, innerWidth=${overflow390.innerWidth})`,
  );
  console.log(`✓ [5/10] Phone-first closer view at 390px: scrollWidth=${overflow390.scrollWidth}px (zero horizontal overflow)`);

  // Restore desktop viewport
  await send("Emulation.clearDeviceMetricsOverride");
  await sleep(150);

  // 6. Keyboard navigation on role tabs
  await evaluate(`
    const tab = document.querySelector('#tab-closer');
    tab.focus();
    tab.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  `);
  await sleep(150);
  const activeAfterArrow = await evaluate(`
    return document.querySelector('[role="tab"][aria-selected="true"]')?.id;
  `);
  assert.equal(activeAfterArrow, "tab-buyer", "ArrowDown from Closer tab should select Buyer tab");
  console.log("✓ [6/10] Keyboard navigation on role tabs: ArrowDown moved selection to", activeAfterArrow);

  // 7. Switch to Inventory (stock) & Raise PO to clear alert
  await evaluate(`document.querySelector('#tab-stock').click();`);
  await sleep(150);
  const stockBefore = await evaluate(`return document.querySelector(".alert")?.innerText;`);
  await evaluate(`
    const raiseAllBtn = Array.from(document.querySelectorAll(".alert button")).find(b => b.innerText.includes("Raise POs"));
    if (raiseAllBtn) raiseAllBtn.click();
  `);
  await sleep(150);
  const stockAfter = await evaluate(`return document.querySelector(".alert")?.innerText;`);
  assert.ok(stockAfter.includes("Stock loop closed"), `Raising POs should clear stock alert, got: ${stockAfter}`);
  console.log("✓ [7/10] Inventory PO loop closed:", stockAfter);

  // 7b. Ad budget card: simulated feed label, profit per order, flags against the founder max
  await evaluate(`document.querySelector('#tab-founder').click();`);
  await sleep(200);
  const adCard = await evaluate(`
    const card = Array.from(document.querySelectorAll("section")).find(s => s.innerText.includes("Profit per order and ad cost"));
    return card ? { text: card.innerText, over: Array.from(card.querySelectorAll(".pill")).filter(p => p.innerText.includes("Over max")).length } : null;
  `);
  assert.ok(adCard, "Ad budget card should render on the founder view");
  assert.ok(adCard.text.includes("Simulated Meta feed"), "Ad spend must be labelled as a simulated feed");
  assert.ok(!/Prospecting|Retargeting/.test(adCard.text), "No fixed campaign labels");
  assert.equal(adCard.over, 2, "Both buyers are over the max on the seed");
  await evaluate(`
    const input = document.querySelector('input[aria-label="Max cost per order"]');
    input.focus();
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    set.call(input, "100000");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.blur();
  `);
  await sleep(250);
  const overAfter = await evaluate(`return Array.from(document.querySelectorAll(".pill")).filter(p => p.innerText.includes("Over max")).length;`);
  assert.equal(overAfter, 0, "Raising the max clears the over-max flags");
  console.log("✓ [7b] Ad budget card: simulated feed label, profit per order, max cost per order flags update live");

  // 8. No discounts anywhere; five rules visible; founder price change applies to new orders only
  await evaluate(`document.querySelector('#tab-founder').click();`);
  await sleep(200);
  const noDisc = await evaluate(`
    const body = document.body.innerText;
    return {
      discountButtons: Array.from(document.querySelectorAll("button")).filter(b => /discount/i.test(b.innerText)).length,
      mentionsDiscount: /discount/i.test(body),
      ruleGroups: document.querySelectorAll(".rules-grid .rule").length,
      advanced: /advanced/i.test(document.querySelector(".rules-grid")?.parentElement?.innerText || ""),
      row1043: Array.from(document.querySelectorAll("tbody tr")).find(tr => tr.innerText.includes("#1043"))?.innerText || "",
    };
  `);
  assert.equal(noDisc.discountButtons, 0, "No Discount button anywhere");
  assert.equal(noDisc.mentionsDiscount, false, "The word discount must not appear on screen");
  assert.equal(noDisc.ruleGroups, 5, "Rules strip shows exactly five rules");
  assert.equal(noDisc.advanced, false, "No Advanced section in the rules strip");
  assert.ok(noDisc.row1043.includes("212,000"), "Order #1043 is priced at the company price");
  await evaluate(`
    const input = document.querySelector('input[aria-label="AIR-12 company price"]');
    input.focus();
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    set.call(input, "230000");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.blur();
  `);
  await sleep(250);
  const afterPrice = await evaluate(`return Array.from(document.querySelectorAll("tbody tr")).find(tr => tr.innerText.includes("#1043"))?.innerText || "";`);
  assert.ok(afterPrice.includes("212,000") && !afterPrice.includes("230,000"), "A price change must not re-price an existing order");
  console.log("✓ [8/10] No discounts, five rules visible, price change leaves existing orders alone");

  // 9. Post-close return on W43 order #1033 & Close cycle W44
  await evaluate(`
    const filterPaid = Array.from(document.querySelectorAll(".filters .chip")).find(b => b.innerText.includes("Paid in W42/W43"));
    filterPaid.click();
  `);
  await sleep(150);
  await evaluate(`
    const row1033 = Array.from(document.querySelectorAll("tbody tr")).find(tr => tr.innerText.includes("#1033"));
    const retBtn = Array.from(row1033.querySelectorAll("button")).find(b => b.innerText.includes("Process return"));
    retBtn.click();
  `);
  await sleep(150);
  const retConsequence = await evaluate(`return document.querySelector(".dialog .calc .tot")?.innerText;`);
  assert.ok(retConsequence.includes("taken back"), `Return dialog should show pay-taken-back consequence: ${retConsequence}`);
  await evaluate(`
    const confirmRet = Array.from(document.querySelectorAll(".dialog-foot button")).find(b => b.innerText.includes("Confirm return"));
    confirmRet.click();
  `);
  await sleep(150);
  console.log("✓ [9/10] Processed post-close return on W43 Order #1033:", retConsequence.replace(/\s+/g, " "));

  // Close & approve W44
  await evaluate(`
    const closeBtn = Array.from(document.querySelectorAll("button")).find(b => b.innerText.includes("Close & approve W44"));
    closeBtn.click();
  `);
  await sleep(200);
  const newOpenCycle = await evaluate(`return document.querySelector(".side-cycle .pill")?.innerText;`);
  assert.ok(newOpenCycle.includes("W45"), `Closing W44 should open W45, got: ${newOpenCycle}`);

  // 10. Reload page & verify localStorage persistence
  await send("Page.reload");
  await sleep(1000);
  for (let i = 0; i < 30; i++) {
    const ok = await evaluate(`return Boolean(document.querySelector(".side-cycle .pill"));`);
    if (ok) break;
    await sleep(200);
  }
  const persistedCycle = await evaluate(`return document.querySelector(".side-cycle .pill")?.innerText;`);
  assert.ok(persistedCycle.includes("W45"), `State must persist across reload (expected W45, got ${persistedCycle})`);
  console.log("✓ [10/10] Page reloaded — state persisted in localStorage:", persistedCycle);

  // Reset back to clean seed so user gets fresh state if they open a new tab
  await evaluate(`
    const resetBtn = Array.from(document.querySelectorAll(".side-btn")).find(b => b.innerText.includes("Reset demo state"));
    resetBtn.click();
  `);
  await sleep(150);

  assert.equal(errors.length, 0, `Zero console/runtime errors expected, got: ${errors.join("; ")}`);
  console.log("\nALL 10 END-TO-END BROWSER TESTS PASSED WITH 0 RUNTIME ERRORS.");
  ws.close();
} finally {
  proc.kill();
}
