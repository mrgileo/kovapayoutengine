"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Download, FileUp, Scale } from "lucide-react";
import { canRecordCash, cycleById } from "@/lib/engine";
import { downloadText } from "@/lib/download";
import { MAX_FILE_BYTES, type ImportIssue } from "@/lib/importer";
import {
  RECON_TEMPLATES,
  exceptionsCsv,
  parseBankStatement,
  parseRemittances,
  parseReportedSpend,
  parseStockCount,
  reconcileAdSpend,
  reconcileCourierCash,
  reconcilePayouts,
  reconcileStock,
  type BankRow,
  type Parsed,
  type Reconciliation,
  type Remittance,
  type ReportedSpend,
  type StockCountRow,
} from "@/lib/reconcile";
import { personOf } from "@/lib/engine";
import { useData, useStore } from "@/lib/store";
import { askSettleCash } from "@/lib/askActions";
import { Card, Fig } from "./ui";

export type ReconKind = "courier" | "payouts" | "ads" | "stock";

interface Picked {
  name: string;
  text: string;
}

const TONE_PILL = { ok: "pos", warn: "warn", bad: "neg" } as const;

/** One reconciliation: upload a file, see where it agrees with the company and where it does not. */
function ReconCard<T>({
  id,
  title,
  sub,
  fileLabel,
  template,
  templateName,
  parse,
  run,
  extraControls,
  actions,
}: {
  id: string;
  title: string;
  sub: string;
  fileLabel: string;
  template: string;
  templateName: string;
  parse: (text: string) => Parsed<T>;
  run: (rows: T[]) => (Reconciliation & Record<string, unknown>) | null;
  extraControls?: ReactNode;
  actions?: (result: Reconciliation & Record<string, unknown>) => ReactNode;
}) {
  const [picked, setPicked] = useState<Picked | null>(null);
  const [readError, setReadError] = useState<string | null>(null);

  const parsed = useMemo(() => (picked ? parse(picked.text) : null), [picked, parse]);
  const result = useMemo(() => (parsed && parsed.errors.length === 0 ? run(parsed.rows) : null), [parsed, run]);
  const errors: ImportIssue[] = parsed?.errors ?? [];

  async function pick(file: File | undefined) {
    setReadError(null);
    if (!file) {
      setPicked(null);
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setReadError(`${file.name} is ${(file.size / 1048576).toFixed(1)} MB. The limit is ${MAX_FILE_BYTES / 1048576} MB.`);
      return;
    }
    try {
      setPicked({ name: file.name, text: await file.text() });
    } catch {
      setReadError(`Could not read ${file.name}.`);
    }
  }

  return (
    <Card
      id={`recon-${id}`}
      title={title}
      sub={sub}
      actions={
        <button type="button" className="btn xs" onClick={() => downloadText(templateName, template)}>
          <Download size={12} /> Template
        </button>
      }
    >
      <div className="recon-pick">
        <label>
          <span>
            <FileUp size={13} /> {fileLabel}
          </span>
          <input id={`recon-file-${id}`} type="file" accept=".csv,text/csv" aria-label={fileLabel} onChange={(e) => pick(e.target.files?.[0])} />
        </label>
        {extraControls}
      </div>

      {readError && <div className="insight" role="alert"><div>{readError}</div></div>}

      {errors.length > 0 && (
        <div role="alert" className="recon-errors">
          <b>
            {errors.length} problem{errors.length === 1 ? "" : "s"} in this file
          </b>
          <ul>
            {errors.slice(0, 12).map((e, i) => (
              <li key={i}>
                <span className="mono muted">
                  line {e.line}
                  {e.column ? `, ${e.column}` : ""}:
                </span>{" "}
                {e.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {result && (
        <div className="recon-result" id={`recon-result-${id}`}>
          <p className="recon-head">
            <b>{result.agreed.toLocaleString()}</b> of <b>{result.checked.toLocaleString()}</b> checked agree.{" "}
            {result.categories.filter((c) => c.tone !== "ok" && c.count > 0).length === 0 ? "Nothing needs attention." : "The rest are listed below."}
          </p>
          <div className="recon-cats">
            {result.categories.map((c) => (
              <div key={c.key} className={"recon-cat " + c.tone + (c.count === 0 ? " none" : "")} data-cat={c.key}>
                <div>
                  <b>{c.label}</b>
                  <small>{c.help}</small>
                </div>
                <div className="recon-n">
                  <span className={"pill " + (c.count === 0 ? "plain" : TONE_PILL[c.tone])}>{c.count.toLocaleString()}</span>
                  {c.count > 0 && c.amount !== 0 && <Fig amount={c.amount} drill={c.drill} />}
                  {c.count > 0 && c.amount === 0 && (
                    <button type="button" className="link-quiet" onClick={() => useStore.getState().openDrill(c.drill)}>
                      See list
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="recon-actions">
            {actions?.(result)}
            <button type="button" className="btn xs" onClick={() => downloadText(`kova-${id}-exceptions.csv`, exceptionsCsv(result))}>
              <Download size={12} /> Exceptions (CSV)
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}

/** The four reconciliations. Which ones a person sees depends on their role (see App). */
export function ReconcileView({ kinds }: { kinds: ReconKind[] }) {
  const data = useData();
  const role = useStore((s) => s.role);
  const settleCash = askSettleCash;
  const closed = data.cycles.filter((c) => c.status !== "open");
  const [cycleId, setCycleId] = useState("");
  const payCycle = closed.some((c) => c.id === cycleId) ? cycleId : (closed[closed.length - 1]?.id ?? "");
  // Hooks run on every render, whichever cards this role sees.
  const runCourier = useMemo(() => (rows: Remittance[]) => reconcileCourierCash(data, rows) as never, [data]);
  const runPayouts = useMemo(() => (rows: BankRow[]) => (payCycle ? (reconcilePayouts(data, payCycle, rows) as never) : null), [data, payCycle]);
  const runAds = useMemo(
    () => (rows: ReportedSpend[]) => ((data.adSpend?.length ?? 0) > 0 ? (reconcileAdSpend(data.adSpend ?? [], rows, (id) => personOf(data, id).name) as never) : null),
    [data],
  );
  const runStock = useMemo(() => (rows: StockCountRow[]) => reconcileStock(data, rows) as never, [data]);

  return (
    <section className="recon" aria-label="Compare Statements">
      <div className="recon-title">
        <Scale size={15} /> <b>Compare Statements</b>
        <span className="muted">Compare a courier, bank, ad or stock statement with your records.</span>
      </div>

      {kinds.includes("courier") && (
        <ReconCard
          id="courier"
          title="Courier cash"
          sub="Did the courier pay you for every order they delivered?"
          fileLabel="Courier statement (CSV)"
          template={RECON_TEMPLATES.courier}
          templateName="kova-courier-statement-template.csv"
          parse={parseRemittances}
          run={runCourier}
          actions={(r) => {
            const ids = (r as unknown as { recordable: number[] }).recordable;
            return ids.length > 0 && canRecordCash(role) ? (
              <button type="button" className="btn xs primary" onClick={() => settleCash(ids)}>
                Record {ids.length.toLocaleString()} as received
              </button>
            ) : null;
          }}
        />
      )}

      {kinds.includes("payouts") && (
        <ReconCard
          id="payouts"
          title="Bank payouts"
          sub="Did the bank pay each person what they were owed for a closed week?"
          fileLabel="Bank statement (CSV)"
          template={RECON_TEMPLATES.bank}
          templateName="kova-bank-statement-template.csv"
          parse={parseBankStatement}
          run={runPayouts}
          extraControls={
            closed.length > 0 ? (
              <label className="recon-cycle">
                <span>Week</span>
                <select value={payCycle} onChange={(e) => setCycleId(e.target.value)} aria-label="Week to check">
                  {closed.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.id} ({cycleById(data, c.id)?.status})
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <span className="muted">No week has been closed yet, so there are no payouts to check.</span>
            )
          }
        />
      )}

      {kinds.includes("ads") && (
        <ReconCard
          id="ads"
          title="Ad spend"
          sub="Do the buyers' reported ad costs match what the platforms billed?"
          fileLabel="Buyers' reported spend (CSV)"
          template={RECON_TEMPLATES.reportedSpend}
          templateName="kova-reported-ad-spend-template.csv"
          parse={parseReportedSpend}
          run={runAds}
          extraControls={(data.adSpend?.length ?? 0) === 0 ? <span className="muted">Load an ad spend file first (Try it with your orders): there are no platform lines to compare with.</span> : null}
        />
      )}

      {kinds.includes("stock") && (
        <ReconCard
          id="stock"
          title="Stock count"
          sub="Does the shelf count match the stock the system shows?"
          fileLabel="Stock count (CSV)"
          template={RECON_TEMPLATES.stockCount}
          templateName="kova-stock-count-template.csv"
          parse={parseStockCount}
          run={runStock}
        />
      )}
    </section>
  );
}
