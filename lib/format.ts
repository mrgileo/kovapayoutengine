export type Currency = "NGN" | "USD" | "GBP";

export const CCY: Record<Currency, { sym: string; div: number; label: string }> = {
  NGN: { sym: "₦", div: 1, label: "₦ Naira" },
  USD: { sym: "$", div: 1500, label: "$ USD" },
  GBP: { sym: "£", div: 1900, label: "£ GBP" },
};

export function money(n: number, ccy: Currency, opts: { sign?: boolean; compact?: boolean } = {}) {
  const c = CCY[ccy];
  const v = n / c.div;
  const abs = Math.abs(v);
  const dp = ccy === "NGN" ? 0 : abs < 100 ? 2 : 0;
  let body: string;
  if (opts.compact && abs >= 1000) {
    body = abs >= 1_000_000 ? (abs / 1_000_000).toFixed(abs >= 10_000_000 ? 1 : 2) + "m" : (abs / 1000).toFixed(abs >= 100_000 ? 0 : 1).replace(/\.0$/, "") + "k";
  } else {
    body = abs.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
  }
  const neg = Math.round(v * 100) < 0;
  const sign = neg ? "−" : opts.sign && Math.round(v) > 0 ? "+" : "";
  return sign + c.sym + body;
}

export const pct = (n: number, dp = 1) => (n * 100).toFixed(dp) + "%";

export function shortDate(iso: string) {
  const d = new Date(iso.length === 10 ? iso + "T12:00:00Z" : iso);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function dateTime(iso: string) {
  const d = new Date(iso);
  return (
    d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) +
    " · " +
    d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
  );
}

export function relTime(iso: string, now = Date.now()) {
  const s = Math.round((now - new Date(iso).getTime()) / 1000);
  if (s < 45) return "just now";
  if (s < 3600) return Math.round(s / 60) + "m ago";
  if (s < 86400) return Math.round(s / 3600) + "h ago";
  if (s < 86400 * 7) return Math.round(s / 86400) + "d ago";
  return shortDate(iso);
}

export const initials = (name: string) =>
  name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

export const shortName = (name: string) => {
  const [a, b] = name.split(" ");
  return b ? `${a} ${b[0]}.` : a;
};

