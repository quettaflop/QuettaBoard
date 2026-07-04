import { useState, useCallback, useRef, useEffect, useMemo, memo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { BenchmarkResult } from '../../types';
import {
  PROFILE_META,
  AGENT_TYPE_COLORS,
  DATA_SOURCE_COLORS,
  FALLBACK_META_COLORS,
  profileDisplayName,
} from '../../profileMeta';

interface ThroughputChartProps {
  seriesData: Map<string, BenchmarkResult[]>;
}

const COLORS = [
  '#0071e3', '#ff9f0a', '#af52de', '#34c759', '#ff3b30',
  '#5ac8fa', '#a2845e', '#ff6482', '#32ade6', '#66d4cf',
  '#d4a017', '#7d7aff', '#c9184a', '#86868b',
];

type ThroughputMetric = {
  key: string;
  label: string;
  shortLabel: string;
  field: keyof BenchmarkResult['summary'];
  unit: string;
};

const METRICS: ThroughputMetric[] = [
  { key: 'output_tok', label: 'Output Token Throughput', shortLabel: 'Out Tok/s', field: 'output_token_throughput', unit: 'tok/s' },
  { key: 'total_tok', label: 'Total Token Throughput', shortLabel: 'Total Tok/s', field: 'total_token_throughput', unit: 'tok/s' },
  { key: 'request', label: 'Request Throughput', shortLabel: 'Req/s', field: 'request_throughput', unit: 'req/s' },
];

interface HoverEntry {
  name: string;
  value: number;
  color: string;
}

interface HoverState {
  metricLabel: string;
  unit: string;
  concurrency: number;
  entries: HoverEntry[];
}

function buildChartData(
  seriesData: Map<string, BenchmarkResult[]>,
  field: keyof BenchmarkResult['summary']
) {
  const concSet = new Set<number>();
  const seriesNames = Array.from(seriesData.keys());

  for (const [, results] of seriesData) {
    for (const r of results) concSet.add(r.config.concurrency);
  }

  const concLevels = Array.from(concSet).sort((a, b) => a - b);

  const lookup = new Map<string, Map<number, number>>();
  for (const [key, results] of seriesData) {
    const concMap = new Map<number, number>();
    for (const r of results) concMap.set(r.config.concurrency, r.summary[field] as number);
    lookup.set(key, concMap);
  }

  return concLevels.map((conc) => {
    const point: Record<string, number> = { concurrency: conc };
    for (const name of seriesNames) {
      const val = lookup.get(name)?.get(conc);
      if (val !== undefined) point[name] = Math.round(val * 100) / 100;
    }
    return point;
  });
}

function shortenSeriesKey(key: string, allKeys: string[]): string {
  const parts = key.split(' / ');
  if (parts.length < 4) return key;

  const partSets = [new Set<string>(), new Set<string>(), new Set<string>(), new Set<string>()];
  for (const k of allKeys) {
    const p = k.split(' / ');
    p.forEach((v, i) => partSets[i]?.add(v));
  }

  const labels: string[] = [];
  const partNames = parts.map((p, i) => {
    if (i === 1) return p.replace('Llama-3.1-', '');
    if (i === 3) return profileDisplayName(p);
    return p;
  });

  for (let i = 0; i < 4; i++) {
    if (partSets[i].size > 1) labels.push(partNames[i]);
  }

  return labels.length > 0 ? labels.join(' · ') : partNames[3];
}

function getUniqueProfiles(seriesData: Map<string, BenchmarkResult[]>): string[] {
  const profiles = new Set<string>();
  for (const [, results] of seriesData) {
    for (const r of results) profiles.add(r.config.profile);
  }
  return Array.from(profiles);
}

function InvisibleTooltip({ active, payload, label, onHover, metricLabel, unit }: {
  active?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: any[];
  label?: number;
  onHover: (state: HoverState | null) => void;
  metricLabel: string;
  unit: string;
}) {
  const stablePayload = active && payload && payload.length > 0 && label != null
    ? JSON.stringify({ metricLabel, unit, concurrency: label, count: payload.filter(p => p.value != null).length })
    : '';
  const payloadRef = useRef(payload);
  payloadRef.current = payload;

  useEffect(() => {
    if (!stablePayload) return;
    const parsed = JSON.parse(stablePayload);
    const entries: HoverEntry[] = (payloadRef.current || [])
      .filter((p: { value: unknown }) => p.value != null)
      .map((p: { dataKey: string; value: number; color: string }) => ({
        name: p.dataKey,
        value: p.value,
        color: p.color,
      }))
      .sort((a: HoverEntry, b: HoverEntry) => b.value - a.value);
    onHover({ ...parsed, entries });
  }, [stablePayload, onHover]);

  return null;
}

function SidePanel({ hover, pinned, seriesNames, onUnpin }: {
  hover: HoverState | null;
  pinned: HoverState | null;
  seriesNames: string[];
  onUnpin: () => void;
}) {
  const display = pinned || hover;

  if (!display) {
    return (
      <div className="flex h-full items-center justify-center px-2 text-center text-[11px] text-[#86868b]">
        Hover any chart to see values.
        <br />Click to pin.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex-shrink-0 border-b border-[#e8e8ed] pb-1.5 mb-1.5">
        <div className="flex items-center justify-between">
          <div className="text-[11px] font-semibold text-[#1d1d1f]">{display.metricLabel}</div>
          {pinned && (
            <button
              onClick={onUnpin}
              className="rounded px-1.5 py-0.5 text-[9px] font-medium text-[#ff9f0a] border border-[#ff9f0a33] bg-[#ff9f0a11] hover:bg-[#ff9f0a22]"
            >
              pinned — click to unpin
            </button>
          )}
        </div>
        <div className="text-[10px] text-[#6e6e73]">Concurrency: {display.concurrency}</div>
      </div>
      <div className="flex-1 overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin', scrollbarColor: '#d2d2d7 #f5f5f7' }}>
        {display.entries.map((entry) => (
          <div
            key={entry.name}
            className="flex items-center gap-1.5 border-b border-[#ffffff] py-[3px]"
          >
            <span
              className="inline-block h-2 w-2 flex-shrink-0 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            <span className="min-w-0 flex-1 truncate text-[10px] text-[#424245]" title={entry.name}>
              {shortenSeriesKey(entry.name, seriesNames)}
            </span>
            <span className="flex-shrink-0 text-[10px] font-mono text-[#1d1d1f]">
              {entry.value.toFixed(1)}
            </span>
          </div>
        ))}
      </div>
      <div className="flex-shrink-0 border-t border-[#e8e8ed] pt-1 mt-1 text-[10px] text-[#86868b]">
        {display.entries.length} series · {display.unit}
      </div>
    </div>
  );
}

// Memoized chart grid: hover updates re-render only the side panel, never the SVGs.
const ChartsGrid = memo(function ChartsGrid({
  seriesData,
  onHover,
  onLeave,
  onChartClick,
  hasPin,
}: {
  seriesData: Map<string, BenchmarkResult[]>;
  onHover: (state: HoverState | null) => void;
  onLeave: () => void;
  onChartClick: () => void;
  hasPin: boolean;
}) {
  const seriesNames = useMemo(() => Array.from(seriesData.keys()), [seriesData]);
  const chartDatas = useMemo(
    () => METRICS.map((metric) => buildChartData(seriesData, metric.field)),
    [seriesData],
  );
  const showDots = seriesNames.length <= 8;

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      {METRICS.map((metric, idx) => {
        const isOrphan = idx === 2;
        return (
          <div
            key={metric.key}
            className={`rounded-2xl border border-[#e8e8ed] bg-white p-4 ${isOrphan ? 'xl:col-span-2' : ''}`}
            style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
          >
            <div className="mb-2">
              <h3 className="text-sm font-semibold tracking-tight text-[#1d1d1f]">{metric.label}</h3>
              <span className="text-[10px] text-[#6e6e73]">{metric.unit}</span>
            </div>
            <ResponsiveContainer width="100%" height={isOrphan ? 280 : 260}>
              <AreaChart
                data={chartDatas[idx]}
                margin={{ top: 5, right: 10, bottom: 5, left: 10 }}
                onMouseLeave={onLeave}
                onClick={onChartClick}
                style={{ cursor: hasPin ? 'pointer' : 'crosshair' }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e8e8ed" />
                <XAxis
                  dataKey="concurrency"
                  scale="log"
                  domain={['dataMin', 'dataMax']}
                  type="number"
                  tick={{ fill: '#6e6e73', fontSize: 11 }}
                  axisLine={{ stroke: '#d2d2d7' }}
                  tickLine={{ stroke: '#d2d2d7' }}
                  label={{ value: 'Concurrency', position: 'insideBottom', offset: -2, fill: '#6e6e73', fontSize: 11 }}
                />
                <YAxis
                  tick={{ fill: '#6e6e73', fontSize: 11 }}
                  axisLine={{ stroke: '#d2d2d7' }}
                  tickLine={{ stroke: '#d2d2d7' }}
                  label={{ value: metric.unit, angle: -90, position: 'insideLeft', fill: '#6e6e73', fontSize: 11 }}
                />
                <Tooltip
                  content={<InvisibleTooltip onHover={onHover} metricLabel={metric.shortLabel} unit={metric.unit} />}
                  cursor={{ stroke: '#d2d2d7', strokeWidth: 1 }}
                />
                {seriesNames.map((name, i) => (
                  <Area
                    key={name}
                    type="monotone"
                    dataKey={name}
                    stroke={COLORS[i % COLORS.length]}
                    fill={COLORS[i % COLORS.length]}
                    fillOpacity={0.1}
                    strokeWidth={2}
                    dot={showDots ? { r: 3, fill: COLORS[i % COLORS.length] } : false}
                    activeDot={{ r: 5 }}
                    connectNulls
                    isAnimationActive={false}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        );
      })}
    </div>
  );
});

export function ThroughputChart({ seriesData }: ThroughputChartProps) {
  const [hover, setHover] = useState<HoverState | null>(null);
  const [pinned, setPinned] = useState<HoverState | null>(null);
  const pinnedRef = useRef(pinned);
  pinnedRef.current = pinned;
  const hoverRef = useRef(hover);
  hoverRef.current = hover;

  // Stable callbacks (via refs) so ChartsGrid's memo holds across hover updates.
  const handleHover = useCallback((state: HoverState | null) => {
    if (!pinnedRef.current) setHover(state);
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (!pinnedRef.current) setHover(null);
  }, []);

  const handleChartClick = useCallback(() => {
    setPinned((prev) => {
      if (prev) {
        setHover(null);
        return null;
      }
      return hoverRef.current;
    });
  }, []);

  if (seriesData.size === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border border-[#e8e8ed] bg-[#ffffff] text-[#6e6e73]">
        No data matches current filters
      </div>
    );
  }

  const seriesNames = Array.from(seriesData.keys());
  const uniqueProfiles = getUniqueProfiles(seriesData);
  const singleProfile = uniqueProfiles.length === 1 ? uniqueProfiles[0] : null;
  const singleMeta = singleProfile ? PROFILE_META[singleProfile] : null;

  return (
    <div className="flex gap-4">
      <div className="min-w-0 flex-1">
        {singleMeta && singleProfile && (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="max-w-full truncate text-xs font-semibold text-[#1d1d1f]" title={profileDisplayName(singleProfile)}>
              {profileDisplayName(singleProfile)}
            </span>
            <span
              className="inline-block rounded-full border px-2 py-0.5 text-[10px] font-medium"
              style={{
                backgroundColor: (AGENT_TYPE_COLORS[singleMeta.agentType] ?? FALLBACK_META_COLORS).bg,
                color: (AGENT_TYPE_COLORS[singleMeta.agentType] ?? FALLBACK_META_COLORS).text,
                borderColor: (AGENT_TYPE_COLORS[singleMeta.agentType] ?? FALLBACK_META_COLORS).border,
              }}
            >
              {singleMeta.agentType}
            </span>
            <span
              className="inline-block rounded-full border px-2 py-0.5 text-[10px] font-medium"
              style={{
                backgroundColor: (DATA_SOURCE_COLORS[singleMeta.dataSource] ?? FALLBACK_META_COLORS).bg,
                color: (DATA_SOURCE_COLORS[singleMeta.dataSource] ?? FALLBACK_META_COLORS).text,
                borderColor: (DATA_SOURCE_COLORS[singleMeta.dataSource] ?? FALLBACK_META_COLORS).border,
              }}
            >
              {singleMeta.dataSource}
            </span>
          </div>
        )}
        <ChartsGrid
          seriesData={seriesData}
          onHover={handleHover}
          onLeave={handleMouseLeave}
          onChartClick={handleChartClick}
          hasPin={pinned !== null}
        />
      </div>

      {/* Shared side panel */}
      <div className="hidden w-60 flex-shrink-0 xl:block">
        <div className="sticky top-4 rounded-lg border border-[#e8e8ed] bg-[#f5f5f7] p-3" style={{ height: 'calc(100vh - 200px)', maxHeight: '700px' }}>
          <SidePanel hover={hover} pinned={pinned} seriesNames={seriesNames} onUnpin={() => { setPinned(null); setHover(null); }} />
        </div>
      </div>
    </div>
  );
}
