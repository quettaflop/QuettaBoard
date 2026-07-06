import { useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { BenchmarkResult } from '../../types';
import { profileDisplayName } from '../../profileMeta';

interface ComparisonChartProps {
  seriesData: Map<string, BenchmarkResult[]>;
}

const METRIC_OPTIONS = [
  { value: 'median_ttft_ms', label: 'TTFT (median, ms)' },
  { value: 'p90_ttft_ms', label: 'TTFT (p90, ms)' },
  { value: 'median_tpot_ms', label: 'TPOT (median, ms)' },
  { value: 'p90_tpot_ms', label: 'TPOT (p90, ms)' },
  { value: 'median_itl_ms', label: 'ITL (median, ms)' },
  { value: 'p90_itl_ms', label: 'ITL (p90, ms)' },
  { value: 'median_e2el_ms', label: 'E2EL (median, ms)' },
  { value: 'output_token_throughput', label: 'Output Tok/s' },
  { value: 'total_token_throughput', label: 'Total Tok/s' },
  { value: 'request_throughput', label: 'Request Throughput' },
];

function shortenSeriesKey(key: string): string {
  const parts = key.split(' / ');
  if (parts.length < 4) return key;
  return `${parts[0]} ${parts[1].replace('Llama-3.1-', '')} ${parts[2]} ${profileDisplayName(parts[3])}`;
}

export function ComparisonChart({ seriesData }: ComparisonChartProps) {
  const seriesNames = Array.from(seriesData.keys());
  const [seriesA, setSeriesA] = useState(seriesNames[0] || '');
  const [seriesB, setSeriesB] = useState(seriesNames[1] || seriesNames[0] || '');
  const [metric, setMetric] = useState('median_tpot_ms');

  if (seriesData.size < 1) {
    return (
      <div className="glass flex h-64 items-center justify-center rounded-[22px] text-[#a9afba]">
        Need at least one series to compare. Adjust filters.
      </div>
    );
  }

  // Build chart data
  const concSet = new Set<number>();
  const aResults = seriesData.get(seriesA) || [];
  const bResults = seriesData.get(seriesB) || [];
  for (const r of [...aResults, ...bResults]) concSet.add(r.config.concurrency);
  const concLevels = Array.from(concSet).sort((a, b) => a - b);

  const aMap = new Map<number, number>();
  for (const r of aResults) {
    aMap.set(r.config.concurrency, r.summary[metric as keyof typeof r.summary] as number);
  }
  const bMap = new Map<number, number>();
  for (const r of bResults) {
    bMap.set(r.config.concurrency, r.summary[metric as keyof typeof r.summary] as number);
  }

  const chartData = concLevels.map((conc) => {
    const point: Record<string, number | undefined> = { concurrency: conc };
    const aVal = aMap.get(conc);
    const bVal = bMap.get(conc);
    if (aVal !== undefined) point['Series A'] = Math.round(aVal * 100) / 100;
    if (bVal !== undefined) point['Series B'] = Math.round(bVal * 100) / 100;
    return point;
  });

  const metricLabel = METRIC_OPTIONS.find((m) => m.value === metric)?.label || metric;

  return (
    <div className="space-y-6">
      {/* Selectors */}
      <div className="glass grid grid-cols-1 gap-4 rounded-[22px] p-6 sm:grid-cols-3">
        <div>
          <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-[#676c76]">Series A</label>
          <select
            value={seriesA}
            onChange={(e) => setSeriesA(e.target.value)}
            className="glass-hover w-full rounded-full border border-[#ffffff1f] bg-white/[0.04] px-3 py-1.5 text-[12px] text-[#f3f4f6] outline-none focus:border-[#2dd4bf]"
          >
            {seriesNames.map((name) => (
              <option key={name} value={name}>
                {shortenSeriesKey(name)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-[#676c76]">Series B</label>
          <select
            value={seriesB}
            onChange={(e) => setSeriesB(e.target.value)}
            className="glass-hover w-full rounded-full border border-[#ffffff1f] bg-white/[0.04] px-3 py-1.5 text-[12px] text-[#f3f4f6] outline-none focus:border-[#2dd4bf]"
          >
            {seriesNames.map((name) => (
              <option key={name} value={name}>
                {shortenSeriesKey(name)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-[#676c76]">Metric</label>
          <select
            value={metric}
            onChange={(e) => setMetric(e.target.value)}
            className="glass-hover w-full rounded-full border border-[#ffffff1f] bg-white/[0.04] px-3 py-1.5 text-[12px] text-[#f3f4f6] outline-none focus:border-[#2dd4bf]"
          >
            {METRIC_OPTIONS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Chart */}
      <div className="glass rounded-[22px] p-6">
        <div className="mb-4 flex items-center gap-2">
          <h3 className="text-[15px] font-semibold tracking-tight text-[#f3f4f6]">{metricLabel} Comparison</h3>
          <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-medium text-[#a9afba]">vs concurrency</span>
        </div>
        <div className="rounded-2xl border border-[#ffffff0f] bg-[#0b0d10] p-2">
        <ResponsiveContainer width="100%" height={400}>
          <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff14" />
            <XAxis
              dataKey="concurrency"
              scale="log"
              domain={['dataMin', 'dataMax']}
              type="number"
              tick={{ fill: '#a9afba', fontSize: 11 }}
              axisLine={{ stroke: '#ffffff14' }}
              tickLine={{ stroke: '#ffffff14' }}
              label={{ value: 'Concurrency', position: 'insideBottom', offset: -2, fill: '#a9afba', fontSize: 11 }}
            />
            <YAxis
              tick={{ fill: '#a9afba', fontSize: 11 }}
              axisLine={{ stroke: '#ffffff14' }}
              tickLine={{ stroke: '#ffffff14' }}
              label={{ value: metricLabel, angle: -90, position: 'insideLeft', fill: '#a9afba', fontSize: 11 }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#0d0f13',
                border: '1px solid #ffffff1f',
                borderRadius: '12px',
                fontSize: '12px',
                color: '#f3f4f6',
                boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
              }}
              labelFormatter={(v) => `Concurrency: ${v}`}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              itemSorter={(item: any) => -(Number(item.value) || 0)}
            />
            <Line
              isAnimationActive={false}
              type="monotone"
              dataKey="Series A"
              name={shortenSeriesKey(seriesA)}
              stroke="#2dd4bf"
              strokeWidth={2}
              dot={{ r: 4, fill: '#2dd4bf' }}
              activeDot={{ r: 6 }}
              connectNulls
            />
            <Line
              isAnimationActive={false}
              type="monotone"
              dataKey="Series B"
              name={shortenSeriesKey(seriesB)}
              stroke="#ff9f0a"
              strokeWidth={2}
              dot={{ r: 4, fill: '#ff9f0a' }}
              activeDot={{ r: 6 }}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
