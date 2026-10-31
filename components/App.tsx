"use client";

import { useEffect, useRef, useState } from "react";
import { isEmptyLink, parseDeepLink } from "@/lib/deeplink";
import { Command, Compass, FileUp, Moon, PanelLeftClose, PanelLeftOpen, RotateCcw, ShieldCheck, Sparkles, Sun } from "lucide-react";
import { PERSONA, cashDesk, computePnl, needsAttention, openCycle, personOf } from "@/lib/engine";
import { CCY, Currency, shortDate } from "@/lib/format";
import { useData, useStore } from "@/lib/store";
import type { Role } from "@/lib/types";
import { AccountantView } from "./AccountantView";
import { ActivityStrip } from "./ActivityStrip";
import { BuyerView, LeadView } from "./BuyerLeadViews";
import { CloserView } from "./CloserView";
import { CycleBar } from "./CycleBar";
import { FounderView } from "./FounderView";
import { ImportDialog } from "./ImportDialog";
import { OrderLedger } from "./OrderLedger";
import {
  AuditLogCard,
  CommandPalette,
  DrillDrawer,
  NewOrderDialog,
  ReturnDialog,
  ToastTray,
} from "./Overlays";
import { RulesStrip } from "./RulesStrip";
import { StockBook } from "./StockBook";
import { Tour } from "./Tour";
import { Avatar, Fig, useMoney, useTableColumnResize } from "./ui";

const ROLE_ORDER: Role[] = ["founder", "closer", "buyer", "lead", "accountant", "stock"];
const SCHEME_KEY = "kova-color-scheme";
const SIDE_KEY = "kova-side-collapsed";

/** Light by default. The browser's own light/dark setting is deliberately ignored; only an explicit toggle saves a choice. */
export type ThemeChoice = "light" | "dark";

function applyScheme(choice: ThemeChoice, save: boolean) {
  if (typeof document === "undefined") return;
  document.querySelectorAll('meta[name="color-scheme"]').forEach((m) => m.setAttribute("content", choice));
  document.documentElement.dataset.theme = choice;
  if (!save) return;
  try {
    window.localStorage?.setItem?.(SCHEME_KEY, choice);
  } catch {}
}

export function App() {
  const [hydrated, setHydrated] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [sideCollapsed, setSideCollapsed] = useState(false);
  const [themeChoice, setThemeChoice] = useState<ThemeChoice>("light");
  const data = useData();
  const role = useStore((s) => s.role);
  const ccy = useStore((s) => s.ccy);
  const guideOpen = useStore((s) => s.guideOpen);
  const setRole = useStore((s) => s.setRole);
  const setCcy = useStore((s) => s.setCcy);
  const setGuide = useStore((s) => s.setGuide);
  const reset = useStore((s) => s.reset);
  const dataSource = useStore((s) => s.dataSource);
  const importSummary = useStore((s) => s.importSummary);
  const setImportOpen = useStore((s) => s.setImportOpen);
  const backToDemo = useStore((s) => s.backToDemo);
  const imported = dataSource === "imported";
  const m = useMoney();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  useTableColumnResize();

  // Lock the page behind any open dialog or drawer so only the overlay scrolls.
  useEffect(() => {
    const root = document.documentElement;
    const sync = () => {
      const open = document.querySelector('[aria-modal="true"]') !== null;
      root.toggleAttribute("data-modal-open", open);
    };
    sync();
    const mo = new MutationObserver(sync);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      mo.disconnect();
      root.removeAttribute("data-modal-open");
    };
  }, []);

  // Open a shared link (?role=…&creditOn=…) once, then tidy the address bar so a reload keeps whatever the visitor does next.
  const applyDeepLink = useStore((s) => s.applyDeepLink);
  useEffect(() => {
    try {
      const link = parseDeepLink(window.location.search);
      if (isEmptyLink(link)) return;
      applyDeepLink(link);
      window.history.replaceState(null, "", window.location.pathname);
    } catch {}
  }, [applyDeepLink]);

  useEffect(() => {
    setHydrated(true);
    try {
      const saved = window.localStorage?.getItem?.(SCHEME_KEY);
      const initial: ThemeChoice = saved === "dark" ? "dark" : "light";
      setThemeChoice(initial);
      applyScheme(initial, false);
      const savedSide = window.localStorage?.getItem?.(SIDE_KEY);
      if (savedSide === "1") setSideCollapsed(true);
    } catch {}

    const onStorage = (e: StorageEvent) => {
      if (e.key === SCHEME_KEY) {
        const val: ThemeChoice = e.newValue === "dark" ? "dark" : "light";
        setThemeChoice(val);
        applyScheme(val, false);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  function toggleSidebar() {
    setSideCollapsed((prev) => {
      const next = !prev;
      try {
        if (next) window.localStorage?.setItem?.(SIDE_KEY, "1");
        else window.localStorage?.removeItem?.(SIDE_KEY);
      } catch {}
      return next;
    });
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdOpen((v) => !v);
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!hydrated) {
    // Rendered on the server too, so the first paint is the shape of the page rather than a blank line while the data loads.
    return (
      <div className="skeleton" role="status" aria-busy="true" aria-label="Loading Kova">
        <div className="sk-bar" />
        <div className="sk-body">
          <div className="sk-title" />
          <div className="sk-tiles">
            {[0, 1, 2, 3].map((n) => (
              <div key={n} className="sk-tile" />
            ))}
          </div>
          <div className="sk-card" />
          <div className="sk-card tall" />
        </div>
      </div>
    );
  }

  const resolvedScheme: ThemeChoice = themeChoice;

  function toggleTheme() {
    selectThemeExplicit(resolvedScheme === "dark" ? "light" : "dark");
  }

  function selectThemeExplicit(choice: ThemeChoice) {
    setThemeChoice(choice);
    applyScheme(choice, true);
  }

  const open = openCycle(data);
  const pnl = computePnl(data);
  const stockAlerts = needsAttention(data).length;
  const cashOwed = cashDesk(data).outstanding.length;
  const activePerson = personOf(data, PERSONA[role]);

  function switchRoleWithTransition(nextRole: Role) {
    if (nextRole === role) return;
    const prevIdx = ROLE_ORDER.indexOf(role);
    const nextIdx = ROLE_ORDER.indexOf(nextRole);
    const direction = nextIdx < prevIdx ? "backwards" : "forwards";

    const doc = document as Document & {
      startViewTransition?: (
        arg: (() => void) | { update: () => void; types?: string[] },
      ) => { finished?: Promise<unknown>; ready?: Promise<unknown> };
    };

    if (typeof doc.startViewTransition === "function") {
      try {
        const vt = doc.startViewTransition({
          update: () => setRole(nextRole),
          types: [direction],
        });
        vt?.ready?.catch(() => {});
        vt?.finished?.catch(() => {});
        return;
      } catch {
        const vt = doc.startViewTransition(() => setRole(nextRole));
        vt?.ready?.catch(() => {});
        vt?.finished?.catch(() => {});
        return;
      }
    }
    setRole(nextRole);
  }

  function onTabKeyDown(e: React.KeyboardEvent, idx: number) {
    let next = -1;
    if (e.key === "ArrowDown" || e.key === "ArrowRight") next = (idx + 1) % ROLE_ORDER.length;
    else if (e.key === "ArrowUp" || e.key === "ArrowLeft") next = (idx - 1 + ROLE_ORDER.length) % ROLE_ORDER.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = ROLE_ORDER.length - 1;
    if (next !== -1) {
      e.preventDefault();
      const r = ROLE_ORDER[next];
      switchRoleWithTransition(r);
      tabRefs.current[next]?.focus();
    }
  }

  return (
    <div className={"shell" + (sideCollapsed ? " collapsed" : "")}>
      {/* Sidebar with WAI-ARIA role tabs */}
      <aside className="side" aria-label="Role navigation and cycle summary">
        <div className="brand">
          <div className="brand-mark" title="Kova Supply Co.">
            K
          </div>
          <div className="brand-copy">
            <b>Kova Supply Co.</b>
            <span>Payout, P&amp;L &amp; Stock Engine</span>
          </div>
          <button
            type="button"
            className="side-collapse-btn"
            onClick={toggleSidebar}
            aria-expanded={!sideCollapsed}
            aria-label={sideCollapsed ? "Expand sidebar (Ctrl+B)" : "Collapse sidebar (Ctrl+B)"}
            title={sideCollapsed ? "Expand sidebar (Ctrl+B)" : "Collapse sidebar (Ctrl+B)"}
          >
            {sideCollapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
          </button>
        </div>

        <div>
          <div className="side-label" id="role-switcher-label">
            <span>Role Persona</span>
            <span className="mono" style={{ opacity: 0.7 }}>↑/↓</span>
          </div>
          <div
            className="personas"
            role="tablist"
            aria-labelledby="role-switcher-label"
            aria-orientation="vertical"
          >
            {ROLE_ORDER.map((r, idx) => {
              const p = personOf(data, PERSONA[r]);
              const selected = role === r;
              return (
                <button
                  key={r}
                  ref={(el) => {
                    tabRefs.current[idx] = el;
                  }}
                  type="button"
                  role="tab"
                  id={`tab-${r}`}
                  aria-selected={selected}
                  aria-controls={`panel-${r}`}
                  tabIndex={selected ? 0 : -1}
                  className="persona"
                  title={`${p.name} · ${p.title}`}
                  onClick={() => switchRoleWithTransition(r)}
                  onKeyDown={(e) => onTabKeyDown(e, idx)}
                >
                  <Avatar id={p.id} name={p.name} />
                  <div className="who">
                    <b>{p.name}</b>
                    <span>{p.title}</span>
                  </div>
                  {r === "accountant" && cashOwed > 0 && (
                    <span className="badge" title={`${cashOwed} delivered orders with cash still with the courier`}>
                      {cashOwed}
                    </span>
                  )}
                  {r === "stock" && stockAlerts > 0 && (
                    <span className="badge" title={`${stockAlerts} SKUs need reorder`}>
                      {stockAlerts}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="side-cycle">
          <div className="row">
            <span style={{ color: "var(--side-muted)" }}>This week</span>
            <span className="pill brand">{open.id} · Open</span>
          </div>
          <div className="row">
            <b>
              {shortDate(open.start)} – {shortDate(open.end)}
            </b>
          </div>
          <div className="row" style={{ borderTop: "1px solid var(--side-line)", paddingTop: 8 }}>
            <span style={{ color: "var(--side-muted)" }}>Actual net</span>
            <b className="mono" style={{ color: pnl.actual < 0 ? "#fca5a5" : "#86efac" }}>
              {m(pnl.actual, { sign: true })}
            </b>
          </div>
        </div>

        <div className="side-foot">
          <label className="sr-only" htmlFor="ccy-select">
            Display currency
          </label>
          <select
            id="ccy-select"
            value={ccy}
            onChange={(e) => setCcy(e.target.value as Currency)}
            aria-label="Display currency"
            title="Display currency"
          >
            {(Object.keys(CCY) as Currency[]).map((k) => (
              <option key={k} value={k}>
                {CCY[k].label}
              </option>
            ))}
          </select>

          <button
            type="button"
            className="side-btn"
            onClick={() => setGuide(!guideOpen)}
            title={guideOpen ? "Exit the tour" : "Take the tour"}
          >
            <Compass size={14} style={{ flexShrink: 0 }} />
            <span className="side-btn-txt">{guideOpen ? "Exit the tour" : "Take the tour"}</span>
          </button>

          {role === "founder" && (
            <button type="button" className="side-btn" onClick={() => setImportOpen(true)} title="Try it with your orders">
              <FileUp size={14} style={{ flexShrink: 0 }} />
              <span className="side-btn-txt">Try it with your orders</span>
            </button>
          )}

          <button
            type="button"
            className="side-btn"
            onClick={reset}
            title="Reset demo state"
          >
            <RotateCcw size={14} style={{ flexShrink: 0 }} />
            <span className="side-btn-txt">Reset demo state</span>
          </button>

          <p className="side-note">
            State persists in <code className="mono">localStorage</code> across refreshes. Click any currency figure to inspect its orders.
          </p>
        </div>
      </aside>

      {/* Main workspace */}
      <main
        className="main"
        id={`panel-${role}`}
        role="tabpanel"
        aria-labelledby={`tab-${role}`}
      >
        <div className="sticky-head">
        <div className="topbar">
          <div className="topbar-left">
            <button
              type="button"
              className="kbd-btn topbar-side-btn"
              onClick={toggleSidebar}
              aria-label={sideCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={sideCollapsed ? "Expand sidebar (Ctrl+B)" : "Collapse sidebar (Ctrl+B)"}
              style={{ padding: "5px 7px" }}
            >
              {sideCollapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
            </button>
            <span className="live-dot" aria-hidden="true" />
            <span>
              <b style={{ color: "var(--ink)" }}>Live Operations Ledger</b> · Week {open.id} ({shortDate(open.start)} – {shortDate(open.end)})
            </span>
            <span className={`pill ${pnl.actual < 0 ? "neg" : "pos"}`}>
              Net: <Fig amount={pnl.actual} sign drill={pnl.drills.actual} />
            </span>
          </div>
          <div className="topbar-right">
            <button
              type="button"
              className="theme-toggle"
              onClick={toggleTheme}
              title={`Switch to ${resolvedScheme === "dark" ? "light" : "dark"} mode (current: ${themeChoice})`}
              aria-label={`Switch to ${resolvedScheme === "dark" ? "light" : "dark"} theme`}
            >
              {resolvedScheme === "dark" ? (
                <>
                  <Sun size={13} style={{ color: "var(--yellow)" }} />
                  <span>Light mode</span>
                </>
              ) : (
                <>
                  <Moon size={13} style={{ color: "#854d0e" }} />
                  <span>Dark mode</span>
                </>
              )}
            </button>

            <button
              type="button"
              className="kbd-btn"
              onClick={() => setCmdOpen(true)}
              title="Open Quick Command Palette (Ctrl+K / ⌘K)"
            >
              <Command size={12} style={{ color: "var(--eyebrow-ink)" }} />
              <span>Quick Actions</span>
              <span className="kbd">⌘K</span>
            </button>
          </div>
        </div>
        <ActivityStrip />
        </div>

        <div className="main-in">
          <header className="page-head">
            <div>
              <div className="eyebrow">
                Viewing as {activePerson.name} · {activePerson.title}
              </div>
              <h1>
                {role === "founder" && "Real Profit, Pay Rules & Weekly Close"}
                {role === "closer" && "Closer Phone Console & Personal Earnings"}
                {role === "buyer" && "Media Buyer Results & Sales per ₦1 of Ads"}
                {role === "lead" && "Sales Team Lead Bonus & Quality Scorecard"}
                {role === "accountant" && "Courier Cash, Payouts & the Bank File"}
                {role === "stock" && "Warehouse Stock Book, Reservations & PO Loop"}
              </h1>
              <p>
                {role === "founder"
                  ? "Only you can edit rules, close weeks, or mark courier cash as received. Every change recalculates the entire company live."
                  : "Rules are locked by the founder. Click any payout or revenue figure to inspect the underlying orders."}
              </p>
            </div>
            <div className="head-actions">
              {!imported && (
                <button type="button" className="btn sm" onClick={() => setGuide(!guideOpen)}>
                  <Sparkles size={13} /> {guideOpen ? "Exit the tour" : "Take the tour"}
                </button>
              )}
            </div>
          </header>

          {imported && importSummary && (
            <div className="insight" role="status" id="imported-banner">
              <ShieldCheck size={17} />
              <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", width: "100%" }}>
                <span>
                  <b>You are looking at your own data:</b> {importSummary.orders} orders, {importSummary.firstWeek} to {importSummary.openWeek}. Your data never leaves this browser.
                </span>
                {role === "founder" && (
                  <span style={{ display: "flex", gap: 8 }}>
                    <button type="button" className="btn xs" onClick={() => setImportOpen(true)}>
                      Load different files
                    </button>
                    <button type="button" className="btn xs primary" onClick={backToDemo}>
                      Back to demo data
                    </button>
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Rules Strip (always visible, gated by role === 'founder') */}
          {role !== "accountant" && <RulesStrip />}

          {/* Role-specific primary view */}
          {role === "founder" && <FounderView />}
          {role === "closer" && <CloserView />}
          {role === "buyer" && <BuyerView />}
          {role === "lead" && <LeadView />}
          {role === "accountant" && (
            <>
              <AccountantView />
              {/* The accountant's own work comes first; the pay rules are read-only for them. */}
              <RulesStrip />
            </>
          )}
          {role === "stock" && <StockBook />}

          {/* Cycle Lifecycle Bar */}
          <CycleBar />

          {/* Order Ledger (cards on closer view, full table otherwise) */}
          <OrderLedger />

          {/* Show StockBook on Founder view as well so founder has full visibility */}
          {role === "founder" && <StockBook />}

          {/* Audit & Event Log */}
          <AuditLogCard />
        </div>
      </main>

      {/* Modals, Drawer, Command Palette & Toasts */}
      <DrillDrawer />
      <ReturnDialog />
      <NewOrderDialog />
      <ImportDialog />
      <CommandPalette
        open={cmdOpen}
        onClose={() => setCmdOpen(false)}
        onSwitchRole={switchRoleWithTransition}
        themeChoice={themeChoice}
        onSelectTheme={selectThemeExplicit}
      />
      <Tour />
      <ToastTray />
    </div>
  );
}
