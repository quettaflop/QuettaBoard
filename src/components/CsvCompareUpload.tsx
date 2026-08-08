import { useCallback, useRef, useState } from 'react';
import { validateCsv, type MeasuredRow, type ValidationError } from '../csvValidation';
import { rooflineKey, type RooflineLookup } from '../rooflinePredictions';
import type { LssLookup } from '../llmsimPredictions';
import { normalizeProfileName } from '../profileMeta';
import type { ServingIndex, ServingRow } from './ServingPredictionsPage';
import type { DataScope } from '../profileMeta';

const EXAMPLE_HEADER = 'gpu,model,backend,profile,concurrency,isl,osl,ttft_meas_ms,tpot_meas_ms,e2el_meas_ms';
const EXAMPLE_ROW = 'H100,Llama-3.1-8B,vllm,chat-singleturn,32,2048,256,145.2,18.7,4930.5';

interface MatchedPrediction {
  label: string;
  color: string;
  pred?: number;
  errPct?: number; // (pred - meas) / meas * 100, signed
}

interface RowResult {
  row: MeasuredRow;
  ttft: MatchedPrediction[];
  tpot: MatchedPrediction[];
  e2el: MatchedPrediction[];
}

function pctError(pred: number | undefined, meas: number): number | undefined {
  if (pred == null || !Number.isFinite(pred)) return undefined;
  return ((pred - meas) / meas) * 100;
}

function matchRow(row: MeasuredRow, gpuRows: ServingRow[], roofline: RooflineLookup, llmsim: LssLookup): RowResult {
  const profile = normalizeProfileName(row.profile);
  const kcMatches = gpuRows.filter(r =>
    r.model === row.model &&
    normalizeProfileName(r.profile) === profile &&
    r.concurrency === row.concurrency,
  );
  const avg = (values: number[]): number | undefined =>
    values.length ? values.reduce((a, b) => a + b, 0) / values.length : undefined;
  const kcTtft = avg(kcMatches.map(r => r.ttft_pred).filter((v): v is number => typeof v === 'number'));
  const kcTpot = avg(kcMatches.map(r => r.tpot_pred).filter((v): v is number => typeof v === 'number'));
  const kcE2el = avg(kcMatches.map(r => r.e2el_pred).filter((v): v is number => typeof v === 'number'));

  const key = rooflineKey(row.gpu, row.model, profile, row.concurrency);
  const rfl = roofline.get(key);
  const lss = llmsim.get(key);

  const line = (label: string, color: string, pred: number | undefined, meas: number): MatchedPrediction => ({
    label, color, pred, errPct: pctError(pred, meas),
  });

  return {
    row,
    ttft: [
      line('kc', '#2dd4bf', kcTtft, row.ttft_meas_ms),
      line('roofline', '#a855f7', rfl?.fwd_ttft_pred, row.ttft_meas_ms),
      line('lss', '#fb923c', lss?.ttft_pred, row.ttft_meas_ms),
    ],
    tpot: [
      line('kc', '#2dd4bf', kcTpot, row.tpot_meas_ms),
      line('roofline', '#a855f7', rfl?.fwd_tpot_pred, row.tpot_meas_ms),
      line('lss', '#fb923c', lss?.tpot_pred, row.tpot_meas_ms),
    ],
    e2el: [
      line('kc', '#2dd4bf', kcE2el, row.e2el_meas_ms),
      line('roofline', '#a855f7', rfl?.fwd_e2el_pred, row.e2el_meas_ms),
      line('lss', '#fb923c', lss?.e2el_pred, row.e2el_meas_ms),
    ],
  };
}

function formatMs(value: number): string {
  if (value >= 10000) return `${(value / 1000).toFixed(1)} s`;
  if (value >= 1000) return `${(value / 1000).toFixed(2)} s`;
  return `${value.toFixed(1)} ms`;
}

function ToneBadge({ pred, errPct }: MatchedPrediction) {
  if (pred == null || errPct == null) {
    return <span className="text-[#676c76]">n/a</span>;
  }
  const abs = Math.abs(errPct);
  const tone = abs < 10 ? 'text-[#3fb950]' : abs < 25 ? 'text-[#58a6ff]' : abs < 50 ? 'text-[#f0883e]' : 'text-[#f85149]';
  return (
    <span className="tabular-nums">
      {formatMs(pred)} <span className={tone}>({errPct >= 0 ? '+' : ''}{errPct.toFixed(1)}%)</span>
    </span>
  );
}

function MetricCell({ meas, predictions }: { meas: number; predictions: MatchedPrediction[] }) {
  return (
    <td className="px-3 py-2 align-top">
      <div className="font-mono text-[13px] text-[#f3f4f6]">{formatMs(meas)} <span className="text-[10px] text-[#676c76]">measured</span></div>
      <div className="mt-1 space-y-0.5 font-mono text-[11px]">
        {predictions.map(p => (
          <div key={p.label} className="flex items-center gap-1.5">
            <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: p.color }} aria-hidden />
            <span className="w-14 shrink-0 uppercase tracking-wide text-[#8b93a1]">{p.label}</span>
            <ToneBadge {...p} />
          </div>
        ))}
      </div>
    </td>
  );
}

export function CsvCompareUpload({
  servingIndex,
  roofline,
  llmsim,
  dataScope,
}: {
  servingIndex: ServingIndex | null;
  roofline: RooflineLookup;
  llmsim: LssLookup;
  dataScope: DataScope;
}) {
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [errors, setErrors] = useState<ValidationError[] | null>(null);
  const [results, setResults] = useState<RowResult[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((file: File) => {
    setFileName(file.name);
    setErrors(null);
    setResults(null);
    file.text().then(text => {
      const validated = validateCsv(text);
      if (!validated.ok) {
        setErrors(validated.errors);
        return;
      }
      const scopeIndex = servingIndex?.[dataScope];
      const matched = validated.rows.map(row =>
        matchRow(row, scopeIndex?.rowsByGpu[row.gpu] ?? [], roofline, llmsim),
      );
      setResults(matched);
    }).catch(() => {
      setErrors([{ row: 0, message: 'Could not read the file as text.' }]);
    });
  }, [servingIndex, roofline, llmsim, dataScope]);

  return (
    <div className="space-y-4">
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files[0];
          if (file) handleFile(file);
        }}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-[20px] border-2 border-dashed p-8 text-center transition-colors ${
          dragOver ? 'border-[#2dd4bf] bg-[#2dd4bf]/[0.06]' : 'border-[#ffffff2e] hover:border-[#ffffff4a]'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={e => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
        <div className="text-[15px] font-medium text-[#f3f4f6]">Drop a CSV here, or click to browse</div>
        <div className="mt-1 text-[12px] text-[#a9afba]">
          {fileName ? `Last file: ${fileName}` : 'Compares your measured results against whatever predictions are already loaded for that config.'}
        </div>
        <div className="mt-3 overflow-x-auto rounded-lg bg-[#0b0d10] px-3 py-2 text-left font-mono text-[10px] text-[#8b93a1]">
          <div>{EXAMPLE_HEADER}</div>
          <div className="text-[#676c76]">{EXAMPLE_ROW}</div>
        </div>
      </div>

      {errors && (
        <div className="rounded-[16px] border border-[#f85149]/30 bg-[#f85149]/[0.06] p-4">
          <div className="text-[13px] font-semibold text-[#f85149]">Format rejected — {errors.length} issue{errors.length === 1 ? '' : 's'}</div>
          <ul className="mt-2 space-y-1 font-mono text-[12px] text-[#f3f4f6]">
            {errors.map((err, i) => (
              <li key={i}>{err.message}</li>
            ))}
          </ul>
        </div>
      )}

      {results && (
        <div className="glass-shell rounded-[20px] p-1.5">
          <div className="overflow-auto rounded-[15px] bg-[#0b0d10]">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-[#ffffff1f] text-left text-[11px] font-semibold uppercase tracking-widest text-[#a9afba]">
                  <th className="px-3 py-2">Config</th>
                  <th className="px-3 py-2">TTFT</th>
                  <th className="px-3 py-2">TPOT</th>
                  <th className="px-3 py-2">E2EL</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={i} className="border-b border-[#ffffff14] odd:bg-white/[0.02]">
                    <td className="px-3 py-2 align-top font-mono text-[11px] text-[#a9afba]">
                      {r.row.gpu} · {r.row.model}<br />
                      {r.row.profile} · c{r.row.concurrency} · {r.row.backend}
                    </td>
                    <MetricCell meas={r.row.ttft_meas_ms} predictions={r.ttft} />
                    <MetricCell meas={r.row.tpot_meas_ms} predictions={r.tpot} />
                    <MetricCell meas={r.row.e2el_meas_ms} predictions={r.e2el} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-3 py-2 text-[11px] text-[#676c76]">
            "n/a" means no prediction was found for that exact (gpu, model, profile, concurrency) — not an error,
            just uncovered ground so far. Nothing here is saved yet — reload the page and it's gone.
          </p>
        </div>
      )}
    </div>
  );
}
