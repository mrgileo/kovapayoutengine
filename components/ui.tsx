"use client";

import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import type { Drill, Stage } from "@/lib/types";
import { useStore } from "@/lib/store";
import { initials, money } from "@/lib/format";

export function useMoney() {
  const ccy = useStore((s) => s.ccy);
  return (n: number, opts?: { sign?: boolean; compact?: boolean }) => money(n, ccy, opts);
}

/** A money figure with live count-up/down tweening, delta flash, and drill-down modal trigger. */
export function Fig({
  amount,
  drill,
  sign,
  compact,
  className,
  children,
}: {
  amount: number;
  drill?: Drill | (() => Drill);
  sign?: boolean;
  compact?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  const m = useMoney();
  const open = useStore((s) => s.openDrill);
  const [displayAmt, setDisplayAmt] = useState(amount);
  const [flash, setFlash] = useState<"up" | "down" | undefined>(undefined);
  const prevRef = useRef(amount);

  useEffect(() => {
    const from = prevRef.current;
    const to = amount;
    if (Math.abs(to - from) < 0.5) {
      setDisplayAmt(to);
      prevRef.current = to;
      return;
    }

    setFlash(to > from ? "up" : "down");
    const timer = window.setTimeout(() => setFlash(undefined), 650);

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setDisplayAmt(to);
      prevRef.current = to;
      return () => window.clearTimeout(timer);
    }

    let raf = 0;
    const start = performance.now();
    const duration = 320;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplayAmt(from + (to - from) * eased);
      if (t < 1) {
        raf = requestAnimationFrame(step);
      } else {
        setDisplayAmt(to);
        prevRef.current = to;
      }
    };
    raf = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
      prevRef.current = to;
    };
  }, [amount]);

  const text = children ?? m(displayAmt, { sign, compact });
  if (!drill) {
    return (
      <span className={"num " + (className ?? "")} data-flash={flash}>
        {text}
      </span>
    );
  }
  return (
    <button
      type="button"
      className={"fig " + (className ?? "")}
      data-flash={flash}
      onClick={() => open(typeof drill === "function" ? drill() : drill)}
      title="See the orders behind this number"
    >
      {text}
    </button>
  );
}

export function Tile({
  label,
  children,
  note,
  tone,
  icon,
}: {
  label: ReactNode;
  children: ReactNode;
  note?: ReactNode;
  tone?: "pos" | "neg" | "warn";
  icon?: ReactNode;
}) {
  return (
    <div className={"tile " + (tone ?? "")}>
      <dt>
        {icon}
        {label}
      </dt>
      <dd>{children}</dd>
      {note && <em>{note}</em>}
    </div>
  );
}

export function Avatar({ id, name, size }: { id: string; name: string; size?: "sm" }) {
  return (
    <span className={`av av-${id} ${size ?? ""}`} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

const STAGE_TONE: Record<Stage, string> = {
  new: "",
  confirmed: "info",
  dispatched: "warn",
  delivered: "pos",
  returned: "neg",
  cancelled: "",
};

export function StagePill({ stage, failed, cashIn }: { stage: Stage; failed?: boolean; cashIn?: boolean }) {
  const label = stage === "cancelled" && failed ? "failed delivery" : stage;
  return (
    <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
      <span className={"pill " + STAGE_TONE[stage]}>{label}</span>
      {stage === "delivered" && !cashIn && <span className="pill plain warn">cash pending</span>}
    </span>
  );
}

export function Card({
  title,
  sub,
  actions,
  children,
  flush,
  id,
}: {
  title: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  flush?: boolean;
  id?: string;
}) {
  function onPointerMove(e: PointerEvent<HTMLElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--mx", `${e.clientX - rect.left}px`);
    e.currentTarget.style.setProperty("--my", `${e.clientY - rect.top}px`);
  }

  return (
    <section
      className={"card" + (flush ? " flush" : "")}
      id={id}
      aria-label={typeof title === "string" ? title : undefined}
      onPointerMove={onPointerMove}
    >
      <header className="card-head">
        <div>
          <h2>{title}</h2>
          {sub && <p>{sub}</p>}
        </div>
        {actions}
      </header>
      {children}
    </section>
  );
}

/** Delegated column resizer for all `.tbl` tables (drag header breaker lines to adjust width, double-click to reset). */
export function useTableColumnResize() {
  useEffect(() => {
    let activeTh: HTMLTableCellElement | null = null;
    let activeTable: HTMLTableElement | null = null;
    let startX = 0;
    let startW = 0;
    let startTableW = 0;
    let hoveredTh: HTMLTableCellElement | null = null;

    function findTargetResizeTh(e: MouseEvent | globalThis.PointerEvent): HTMLTableCellElement | null {
      const el = (e.target as HTMLElement | null)?.closest?.(".tbl th") as HTMLTableCellElement | null;
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      const offsetRight = rect.right - e.clientX;
      const offsetLeft = e.clientX - rect.left;
      if (offsetRight <= 11) {
        return el;
      }
      if (offsetLeft <= 8 && el.previousElementSibling instanceof HTMLTableCellElement) {
        return el.previousElementSibling;
      }
      return null;
    }

    function clearHover() {
      if (hoveredTh) {
        delete hoveredTh.dataset.resizeHover;
        hoveredTh.style.cursor = "";
        hoveredTh = null;
      }
    }

    function onPointerMove(e: globalThis.PointerEvent) {
      if (activeTh && activeTable) {
        const dx = e.clientX - startX;
        const newW = Math.max(58, Math.round(startW + dx));
        const actualDelta = newW - startW;
        activeTh.style.width = `${newW}px`;
        activeTh.style.minWidth = `${newW}px`;
        activeTh.style.maxWidth = `${newW}px`;
        activeTable.style.width = `${Math.max(300, Math.round(startTableW + actualDelta))}px`;
        return;
      }

      const targetTh = findTargetResizeTh(e);
      if (targetTh !== hoveredTh) {
        clearHover();
        if (targetTh) {
          hoveredTh = targetTh;
          hoveredTh.dataset.resizeHover = "true";
          hoveredTh.style.cursor = "col-resize";
        }
      }
    }

    function onPointerDown(e: globalThis.PointerEvent) {
      if (e.button !== 0) return;
      const targetTh = findTargetResizeTh(e);
      if (!targetTh) return;
      const table = targetTh.closest("table.tbl") as HTMLTableElement | null;
      if (!table) return;

      e.preventDefault();
      e.stopPropagation();

      // Snapshot current column widths so other columns stay stable while dragging
      const allThs = Array.from(table.querySelectorAll<HTMLTableCellElement>("thead th"));
      const widths = allThs.map((th) => Math.round(th.getBoundingClientRect().width));
      const tableRect = table.getBoundingClientRect();

      table.style.tableLayout = "fixed";
      table.style.width = `${Math.round(tableRect.width)}px`;
      allThs.forEach((th, idx) => {
        th.style.width = `${widths[idx]}px`;
        th.style.minWidth = `${widths[idx]}px`;
        th.style.maxWidth = `${widths[idx]}px`;
      });

      activeTh = targetTh;
      activeTable = table;
      startX = e.clientX;
      startW = targetTh.getBoundingClientRect().width;
      startTableW = tableRect.width;
      activeTh.dataset.resizing = "true";
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }

    function onPointerUp() {
      if (!activeTh) return;
      delete activeTh.dataset.resizing;
      activeTh = null;
      activeTable = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }

    function onDblClick(e: MouseEvent) {
      const targetTh = findTargetResizeTh(e);
      if (!targetTh) return;
      const table = targetTh.closest("table.tbl") as HTMLTableElement | null;
      if (!table) return;
      e.preventDefault();
      table.style.tableLayout = "";
      table.style.width = "";
      table.querySelectorAll<HTMLTableCellElement>("thead th").forEach((th) => {
        th.style.width = "";
        th.style.minWidth = "";
        th.style.maxWidth = "";
      });
    }

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("dblclick", onDblClick);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("dblclick", onDblClick);
    };
  }, []);
}

