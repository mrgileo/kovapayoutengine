"use client";

import { useEffect, useRef, useState } from "react";
import { isEmptyLink, parseDeepLink } from "@/lib/deeplink";
import { L } from "@/lib/labels";
import { Command, FileUp, Mail, Moon, Play, PanelLeftClose, PanelLeftOpen, RotateCcw, ShieldCheck, SlidersHorizontal, Sun } from "lucide-react";
import { canSeeAllPayouts, canSeeFullAudit, canSeeRules, cashDesk, computePnl, needsAttention, openCycle, personOf, viewerOf } from "@/lib/engine";
import { cashDeskOf, needsAttentionOf, pnlOf } from "@/lib/derived";
import { CCY, Currency, shortDate } from "@/lib/format";
import { useData, useStore } from "@/lib/store";
import type { Role } from "@/lib/types";
import { AccountantView } from "./AccountantView";
import { ActivityStrip } from "./ActivityStrip";
import { BuyerView, LeadView } from "./BuyerLeadViews";
import { CloserView } from "./CloserView";
import { CycleBar } from "./CycleBar";
import { CashHero, FounderView } from "./FounderView";
import { ImportDialog } from "./ImportDialog";
import { OrderLedger } from "./OrderLedger";
import {
  AuditLogCard,
  CommandPalette,
  DrillDrawer,
  NewOrderDialog,
  ToastTray,
} from "./Overlays";
import { ActionDialog } from "./ActionDialog";
import { RulesDrawer } from "./RulesDrawer";
import { MyWeeklyPay } from "./MyWeeklyPay";
import { StockBook } from "./StockBook";
import { Tour } from "./Tour";
import { WaitlistDialog } from "./WaitlistDialog";
import { Avatar, Deferred, Fig, useMoney, useTableColumnResize } from "./ui";

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
  } catch { }
}

export function App() {
  const [hydrated, setHydrated] = useState(false);
  // The saved company is read asynchronously (large companies live in IndexedDB), so wait for it before drawing numbers.
  const [stored, setStored] = useState(false);
  useEffect(() => {
    if (useStore.persist.hasHydrated()) setStored(true);
    return useStore.persist.onFinishHydration(() => setStored(true));
  }, []);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [waitOpen, setWaitOpen] = useState(false);
  const [sideCollapsed, setSideCollapsed] = useState(false);
  const [themeChoice, setThemeChoice] = useState<ThemeChoice>("light");
  const data = useData();
  const role = useStore((s) => s.role);
  const ccy = useStore((s) => s.ccy);
  const guideOpen = useStore((s) => s.guideOpen);
  const setRole = useStore((s) => s.setRole);
  const setCcy = useStore((s) => s.setCcy);
  const setGuide = useStore((s) => s.setGuide);
  const setRulesOpen = useStore((s) => s.setRulesOpen);
  const viewers = useStore((s) => s.viewers);
  const setViewer = useStore((s) => s.setViewer);
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
    } catch { }
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
    } catch { }

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
      } catch { }
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

  if (!hydrated || !stored) {
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
  const pnl = pnlOf(data);
  const stockAlerts = needsAttentionOf(data).length;
  const cashOwed = cashDeskOf(data).outstanding.length;
  const activePerson = personOf(data, viewerOf(data, role, viewers));
  const sameRole = data.people.filter((p) => p.role === role);
  // The page body below is remounted whenever the role or the person being viewed changes (see the Deferred key), so
  // what one person typed (a search, a chosen file) is never shown to another.
  const viewKey = `${role}:${activePerson.id}`;

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

    // Snapshotting a page with thousands of rows is itself slow, so big companies switch without the slide.
    if (typeof doc.startViewTransition === "function" && data.orders.length < 3000) {
      try {
        const vt = doc.startViewTransition({
          update: () => setRole(nextRole),
          types: [direction],
        });
        vt?.ready?.catch(() => { });
        vt?.finished?.catch(() => { });
        return;
      } catch {
        const vt = doc.startViewTransition(() => setRole(nextRole));
        vt?.ready?.catch(() => { });
        vt?.finished?.catch(() => { });
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
              const p = personOf(data, viewerOf(data, r, viewers));
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

          <button type="button" className="side-btn" onClick={() => setGuide(true, "demo")} title={L.guidedDemo}>
            <Play size={14} style={{ flexShrink: 0 }} />
            <span className="side-btn-txt">{L.guidedDemo}</span>
          </button>

          <button type="button" className="side-btn" onClick={() => setWaitOpen(true)} title="Join the waitlist">
            <Mail size={14} style={{ flexShrink: 0 }} />
            <span className="side-btn-txt">Join the waitlist</span>
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
            Your changes are saved in this browser and survive a refresh. Click any figure to see the orders behind it.
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
                <b className="tb-title" style={{ color: "var(--ink)" }}>Live Operations Ledger · </b>Week {open.id}<span className="tb-dates"> ({shortDate(open.start)} – {shortDate(open.end)})</span>
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
                    <span className="tb-label">Light mode</span>
                  </>
                ) : (
                  <>
                    <Moon size={13} style={{ color: "#854d0e" }} />
                    <span className="tb-label">Dark mode</span>
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
                <span className="tb-label">Quick Actions</span>
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
                {sameRole.length > 1 && (
                  <select
                    className="viewer-pick"
                    aria-label={`Which ${role} to view as`}
                    value={activePerson.id}
                    onChange={(e) => setViewer(role, e.target.value)}
                  >
                    {sameRole.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <h1>
                {role === "founder" && "Track returns from every customer purchase"}
                {role === "closer" && "Your Orders & Earnings"}
                {role === "buyer" && "Your Ad Spend, Orders & Pay"}
                {role === "lead" && "Your Team, Orders & Pay"}
                {role === "accountant" && "Courier Cash, Payouts & the Bank File"}
                {role === "stock" && "Warehouse Stock, Reorders & Purchase Orders"}
              </h1>
              {role === "founder" && dataSource === "demo" && (
                <p className="demo-note" id="demo-note">
                  <b>Demo:</b> you are looking at a sample week ({open.id}) for a small home-goods seller. Click any figure to see the orders behind it, or load your own orders to see your business.
                </p>
              )}
              {role !== "founder" && (
                <p>{L.roleIntro[role]}</p>
              )}
            </div>
            <div className="head-actions">
              {canSeeRules(role) && (
                <button type="button" className="btn sm" onClick={() => setRulesOpen(true)}>
                  <SlidersHorizontal size={13} /> Pay rules
                </button>
              )}
              <button type="button" className="btn sm light" onClick={() => setWaitOpen(true)}>
                <Mail size={13} /> Join the waitlist
              </button>
              {!imported && !guideOpen && (
                <button type="button" className="btn sm primary" onClick={() => setGuide(true, "demo")}>
                  <Play size={13} /> {L.guidedDemo}
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

          <Deferred key={viewKey}>
          {role === "founder" && <CashHero />}

          {/* Role-specific primary view */}
          {role === "founder" && <FounderView />}
          {role === "closer" && <CloserView />}
          {role === "buyer" && <BuyerView />}
          {role === "lead" && <LeadView />}
          {role === "accountant" && <AccountantView />}
          {role === "stock" && <StockBook />}

          {/* Weekly payouts: everyone's for the founder and accountant; your own weeks for everyone else who is paid */}
          {canSeeAllPayouts(role) ? <CycleBar /> : role !== "stock" && role !== "buyer" && <MyWeeklyPay />}

          {/* "Compare Statements" (components/ReconcileView.tsx) is parked: statements are not always on hand.
              To bring it back, render <ReconcileView kinds={...} /> here per role (founder: all four,
              accountant: courier/payouts/ads, stock: stock). */}

          {/* Manage Orders: only the orders each role works with */}
          <OrderLedger />

          {/* Stock book on the founder page too */}
          {role === "founder" && <StockBook />}

          {/* Audit log: everything for founder and accountant, your own actions for everyone else */}
          <AuditLogCard />
          </Deferred>
        </div>
      </main>

      {/* Modals, Drawer, Command Palette & Toasts */}
      <DrillDrawer />
      <RulesDrawer />
      <NewOrderDialog />
      <ActionDialog />
      <ImportDialog />
      <WaitlistDialog open={waitOpen} onClose={() => setWaitOpen(false)} />
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
