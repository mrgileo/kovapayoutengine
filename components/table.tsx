"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from "lucide-react";
import { nextSort, sortRows, type SortDir, type SortValue } from "@/lib/sort";

/** Shared pieces for every long table: a search box, sortable headers and a "Sort by" menu. */

export interface Col<T> {
  key: string;
  label: string;
  /** What the column sorts on. Only read while this column is the one being sorted. */
  get: (row: T) => SortValue;
  align?: "r";
  /** Money and counts read best biggest-first, so their first click sorts high to low. */
  first?: SortDir;
}

export interface Sorter<T> {
  cols: Col<T>[];
  sorted: T[];
  key: string | null;
  dir: SortDir;
  toggle: (key: string) => void;
  set: (key: string | null, dir?: SortDir) => void;
}

export function useSortable<T>(rows: readonly T[], cols: Col<T>[], initial?: { key: string; dir: SortDir }): Sorter<T> {
  const [sort, setSort] = useState<{ key: string; dir: SortDir } | null>(initial ?? null);
  const active = sort ? cols.find((c) => c.key === sort.key) : undefined;
  const sorted = useMemo(
    () => (sort && active ? sortRows(rows, active.get, sort.dir) : (rows as T[])),
    // `active.get` changes every render for inline getters; the sort itself only depends on rows and the chosen key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, sort?.key, sort?.dir],
  );
  return {
    cols,
    sorted,
    key: active ? sort!.key : null,
    dir: sort?.dir ?? "asc",
    toggle: (key) => setSort((cur) => nextSort(cur, key, cols.find((c) => c.key === key)?.first)),
    set: (key, dir = "asc") => setSort(key ? { key, dir } : null),
  };
}

/** A column header that sorts when clicked (or when Enter or Space is pressed on it). */
export function SortTh<T>({ s, col, className }: { s: Sorter<T>; col: string; className?: string }) {
  const c = s.cols.find((x) => x.key === col)!;
  const on = s.key === col;
  const Icon = !on ? ArrowUpDown : s.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th className={[c.align === "r" ? "r" : "", className ?? ""].join(" ").trim() || undefined} aria-sort={on ? (s.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" className={"sort-btn" + (on ? " on" : "")} onClick={() => s.toggle(col)} title={`Sort by ${c.label}`}>
        <span>{c.label}</span>
        <Icon size={11} aria-hidden="true" />
      </button>
    </th>
  );
}

/** The friendlier alternative to header clicks: pick a column from a menu, then flip the direction. Also works for card lists. */
export function SortSelect<T>({ s, label = "Sort by" }: { s: Sorter<T>; label?: string }) {
  return (
    <span className="sort-select">
      <label>
        <span className="sr-only">{label}</span>
        <select
          value={s.key ?? ""}
          aria-label={label}
          onChange={(e) => {
            const key = e.target.value;
            s.set(key || null, s.cols.find((c) => c.key === key)?.first ?? "asc");
          }}
        >
          <option value="">{label}: default order</option>
          {s.cols.map((c) => (
            <option key={c.key} value={c.key}>
              {label}: {c.label}
            </option>
          ))}
        </select>
      </label>
      {s.key && (
        <button type="button" className="btn xs" onClick={() => s.set(s.key, s.dir === "asc" ? "desc" : "asc")} aria-label={s.dir === "asc" ? "Sorted low to high. Press to reverse." : "Sorted high to low. Press to reverse."}>
          {s.dir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
        </button>
      )}
    </span>
  );
}

export function SearchBox({ value, onChange, label, placeholder }: { value: string; onChange: (v: string) => void; label: string; placeholder?: string }) {
  return (
    <label className="search-box">
      <Search size={12} />
      <input type="search" placeholder={placeholder ?? "Search…"} value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} />
    </label>
  );
}

/** A table body capped in height so a long list scrolls inside its card, with the header staying put. */
export function ScrollTable({ rows = 8, children }: { rows?: number; children: ReactNode }) {
  return (
    <div className="tbl-wrap scroll" style={{ ["--rows" as string]: rows }}>
      {children}
    </div>
  );
}

/** "Nothing matches" row/notice for a search that found no rows. */
export function NoMatches({ query }: { query: string }) {
  return (
    <p className="muted" style={{ padding: "14px 20px", margin: 0, fontSize: 13 }}>
      Nothing matches &ldquo;{query.trim()}&rdquo;.
    </p>
  );
}

/** Search box plus "Sort by" menu, the standard toolbar for a long table's card header. */
export function TableTools<T>({ query, onQuery, sorter, label, placeholder }: { query: string; onQuery: (v: string) => void; sorter: Sorter<T>; label: string; placeholder?: string }) {
  return (
    <div className="filters" style={{ alignItems: "center" }}>
      <SearchBox value={query} onChange={onQuery} label={label} placeholder={placeholder} />
      <SortSelect s={sorter} />
    </div>
  );
}
