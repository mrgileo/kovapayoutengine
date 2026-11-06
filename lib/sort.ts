// Sorting and searching for tables, kept pure so verify.ts can test it. No React, no browser APIs.

export type SortValue = string | number | null | undefined;
export type SortDir = "asc" | "desc";

const isEmpty = (v: SortValue) => v === null || v === undefined || v === "" || (typeof v === "number" && Number.isNaN(v));

/** Numbers by size, text with numbers read as numbers ("SKU-2" before "SKU-10"), empty values always last. */
export function compareValues(a: SortValue, b: SortValue): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

/**
 * A sorted copy. Each row's value is read once (so an expensive column is only computed when it is the one being
 * sorted), empty values stay at the bottom in both directions, and equal rows keep their original order.
 */
export function sortRows<T>(rows: readonly T[], get: (row: T) => SortValue, dir: SortDir): T[] {
  const keyed = rows.map((row, index) => ({ row, index, v: get(row) }));
  const sign = dir === "asc" ? 1 : -1;
  keyed.sort((x, y) => {
    const xe = isEmpty(x.v);
    const ye = isEmpty(y.v);
    if (xe || ye) return xe && ye ? x.index - y.index : xe ? 1 : -1;
    return compareValues(x.v, y.v) * sign || x.index - y.index;
  });
  return keyed.map((k) => k.row);
}

/** The next sort for a header click: first click starts at `first`, the second flips it, the third clears it. */
export function nextSort(current: { key: string; dir: SortDir } | null, key: string, first: SortDir = "asc"): { key: string; dir: SortDir } | null {
  if (!current || current.key !== key) return { key, dir: first };
  if (current.dir === first) return { key, dir: first === "asc" ? "desc" : "asc" };
  return null;
}

/** True when every word the person typed appears somewhere in the row's text. An empty search matches everything. */
export function matchesQuery(query: string, haystack: string): boolean {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const h = haystack.toLowerCase();
  return words.every((w) => h.includes(w));
}
