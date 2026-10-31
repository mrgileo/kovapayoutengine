import { ImageResponse } from "next/og";

export const alt = "Kova: your sales report says +₦497,888, you really made -₦152,420 (demo week)";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const INK = "#111111";
const PAPER = "#f8f8f5";
const YELLOW = "#f5c400";

/** The default OG font has no naira glyph (and cannot fetch one at build time), so draw it: an N with two bars. */
function Amount({ sign, value, color }: { sign: string; value: string; color?: string }) {
  const bar = { position: "absolute" as const, left: -4, right: -4, height: 9, background: color ?? PAPER };
  return (
    <div style={{ display: "flex", alignItems: "center", fontSize: 112, fontWeight: 800, lineHeight: 1.05, color }}>
      <span style={{ marginRight: 10 }}>{sign}</span>
      <span style={{ position: "relative", display: "flex", marginRight: 4 }}>
        N<span style={{ ...bar, top: "36%" }} />
        <span style={{ ...bar, top: "56%" }} />
      </span>
      <span>{value}</span>
    </div>
  );
}

export default function Image() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: INK, color: PAPER, padding: "64px 72px" }}>
        <div style={{ display: "flex", alignItems: "center", fontSize: 34, fontWeight: 700, letterSpacing: 1 }}>
          <div style={{ width: 20, height: 20, background: YELLOW, marginRight: 16, borderRadius: 4 }} />
          KOVA
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 40, color: "#b9b9b2", marginBottom: 14 }}>Your sales report says</div>
          <Amount sign="+" value="497,888" />
          <div style={{ fontSize: 40, color: "#b9b9b2", margin: "30px 0 14px" }}>The week you really made</div>
          <Amount sign="-" value="152,420" color={YELLOW} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 28, color: "#b9b9b2" }}>
          <div>Commission, returns, courier cash and stock in one view</div>
          <div>Demo data</div>
        </div>
      </div>
    ),
    size,
  );
}
