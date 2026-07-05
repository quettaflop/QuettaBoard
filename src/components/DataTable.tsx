import { useState, useMemo } from 'react';
import type { BenchmarkResult } from '../types';
import {
  PROFILE_META,
  AGENT_TYPE_COLORS,
  DATA_SOURCE_COLORS,
  FALLBACK_META_COLORS,
  profileDisplayName,
} from '../profileMeta';

interface DataTableProps {
  data: BenchmarkResult[];
}

type SortField =
  | 'hardware'
  | 'modelShort'
  | 'backend'
  | 'profile'
  | 'type'
  | 'source'
  | 'concurrency'
  | 'successful_requests'
  | 'failed_requests'
  | 'output_token_throughput'
  | 'median_tpot_ms'
  | 'median_itl_ms'
  | 'median_ttft_ms'
  | 'median_e2el_ms';

interface ColumnDef {
  key: SortField;
  label: string;
  align: 'left' | 'right';
  format?: (r: BenchmarkResult) => string;
}

const COLUMNS: ColumnDef[] = [
  { key: 'hardware', label: 'Hardware', align: 'left' },
  { key: 'modelShort', label: 'Model', align: 'left' },
  { key: 'backend', label: 'Backend', align: 'left' },
  { key: 'profile', label: 'Profile', align: 'left' },
  { key: 'type', label: 'Type', align: 'left' },
  { key: 'source', label: 'Source', align: 'left' },
  { key: 'concurrency', label: 'Conc', align: 'right' },
  { key: 'successful_requests', label: 'OK', align: 'right' },
  { key: 'failed_requests', label: 'Fail', align: 'right' },
  {
    key: 'output_token_throughput',
    label: 'Out Tok/s',
    align: 'right',
    format: (r) => r.summary.output_token_throughput.toFixed(1),
  },
  {
    key: 'median_tpot_ms',
    label: 'TPOT p50',
    align: 'right',
    format: (r) => r.summary.median_tpot_ms.toFixed(2),
  },
  {
    key: 'median_itl_ms',
    label: 'ITL p50',
    align: 'right',
    format: (r) => r.summary.median_itl_ms?.toFixed(2) ?? '—',
  },
  {
    key: 'median_ttft_ms',
    label: 'TTFT p50',
    align: 'right',
    format: (r) => r.summary.median_ttft_ms.toFixed(1),
  },
  {
    key: 'median_e2el_ms',
    label: 'E2EL p50',
    align: 'right',
    format: (r) => r.summary.median_e2el_ms.toFixed(0),
  },
];

function getValue(r: BenchmarkResult, field: SortField): string | number {
  switch (field) {
    case 'hardware':
      return r.hardware;
    case 'modelShort':
      return r.modelShort;
    case 'backend':
      return r.config.backend;
    case 'profile':
      return profileDisplayName(r.config.profile);
    case 'type':
      return PROFILE_META[r.config.profile]?.agentType ?? '';
    case 'source':
      return PROFILE_META[r.config.profile]?.dataSource ?? '';
    case 'concurrency':
      return r.config.concurrency;
    case 'successful_requests':
      return r.summary.successful_requests;
    case 'failed_requests':
      return r.summary.failed_requests;
    case 'output_token_throughput':
      return r.summary.output_token_throughput;
    case 'median_tpot_ms':
      return r.summary.median_tpot_ms;
    case 'median_itl_ms':
      return r.summary.median_itl_ms ?? 0;
    case 'median_ttft_ms':
      return r.summary.median_ttft_ms;
    case 'median_e2el_ms':
      return r.summary.median_e2el_ms;
  }
}

function getDisplay(r: BenchmarkResult, col: ColumnDef): string {
  if (col.format) return col.format(r);
  const val = getValue(r, col.key);
  return String(val);
}

export function DataTable({ data }: DataTableProps) {
  const [sortField, setSortField] = useState<SortField>('hardware');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const sorted = useMemo(() => {
    const arr = [...data];
    arr.sort((a, b) => {
      const va = getValue(a, sortField);
      const vb = getValue(b, sortField);
      let cmp: number;
      if (typeof va === 'number' && typeof vb === 'number') {
        cmp = va - vb;
      } else {
        cmp = String(va).localeCompare(String(vb));
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [data, sortField, sortDir]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  if (data.length === 0) {
    return (
      <div className="glass flex h-64 items-center justify-center rounded-[22px] text-[#6e6e73]">
        No data matches current filters
      </div>
    );
  }

  return (
    <div className="glass-shell rounded-[24px] p-1.5">
      <div className="overflow-x-auto rounded-[18px] bg-white">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-[#d2d2d7] bg-white">
            {COLUMNS.map((col) => (
              <th
                key={col.key}
                className={`cursor-pointer whitespace-nowrap px-3 py-3.5 text-[11px] font-semibold uppercase tracking-widest text-[#86868b] transition-colors hover:text-[#1d1d1f] ${
                  col.align === 'right' ? 'text-right' : 'text-left'
                }`}
                onClick={() => handleSort(col.key)}
              >
                {col.label}
                {sortField === col.key && (
                  <span className="ml-1 text-[#0071e3]">{sortDir === 'asc' ? '\u2191' : '\u2193'}</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const meta = PROFILE_META[r.config.profile];
            return (
              <tr
                key={`${r.filename}-${r.config.concurrency}`}
                className="border-b border-[#e8e8ed] bg-white transition-colors hover:bg-[#f5f5f7]"
              >
                {COLUMNS.map((col) => {
                  if (col.key === 'type' && meta) {
                    const colors = AGENT_TYPE_COLORS[meta.agentType] ?? FALLBACK_META_COLORS;
                    return (
                      <td key={col.key} className="whitespace-nowrap px-3 py-2 text-left">
                        <span
                          className="inline-block rounded-full border px-2 py-0.5 text-[10px] font-medium"
                          style={{ backgroundColor: colors.bg, color: colors.text, borderColor: colors.border }}
                        >
                          {meta.agentType}
                        </span>
                      </td>
                    );
                  }
                  if (col.key === 'source' && meta) {
                    const colors = DATA_SOURCE_COLORS[meta.dataSource] ?? FALLBACK_META_COLORS;
                    return (
                      <td key={col.key} className="whitespace-nowrap px-3 py-2 text-left">
                        <span
                          className="inline-block rounded-full border px-2 py-0.5 text-[10px] font-medium"
                          style={{ backgroundColor: colors.bg, color: colors.text, borderColor: colors.border }}
                        >
                          {meta.dataSource}
                        </span>
                      </td>
                    );
                  }
                  if ((col.key === 'type' || col.key === 'source') && !meta) {
                    return <td key={col.key} className="whitespace-nowrap px-3 py-2 text-left text-[#6e6e73]">—</td>;
                  }
                  if (col.key === 'profile') {
                    const displayName = profileDisplayName(r.config.profile);
                    return (
                      <td key={col.key} className="whitespace-nowrap px-3 py-2 text-left text-[#1d1d1f]">
                        <div className="max-w-[220px] truncate" title={displayName}>{displayName}</div>
                        {displayName !== r.config.profile && (
                          <div className="max-w-[220px] truncate text-[10px] text-[#86868b]" title={r.config.profile}>
                            {r.config.profile}
                          </div>
                        )}
                      </td>
                    );
                  }
                  return (
                    <td
                      key={col.key}
                      className={`whitespace-nowrap px-3 py-2 ${
                        col.align === 'right' ? 'text-right font-mono' : 'text-left'
                      } ${
                        col.key === 'failed_requests' && r.summary.failed_requests > 0
                          ? 'text-[#ff3b30]'
                          : 'text-[#1d1d1f]'
                      }`}
                    >
                      {getDisplay(r, col)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
}
