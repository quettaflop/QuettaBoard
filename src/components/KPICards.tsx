import type { BenchmarkResult } from '../types';
import { PROFILE_META, AGENT_TYPE_COLORS } from '../profileMeta';

interface KPICardsProps {
  data: BenchmarkResult[];
  allData: BenchmarkResult[];
}

export function KPICards({ data, allData }: KPICardsProps) {
  const totalRuns = data.length;
  const hwConfigs = new Set(data.map((r) => r.hardware)).size;
  const allHwConfigs = new Set(allData.map((r) => r.hardware)).size;
  const models = new Set(data.map((r) => r.modelShort)).size;
  const allModels = new Set(allData.map((r) => r.modelShort)).size;

  const isFiltered = data.length !== allData.length;

  // Count distinct profiles by agent type in filtered data
  const profilesInData = new Set(data.map((r) => r.config.profile));
  const typeCounts: Record<string, number> = { 'chat': 0, 'coding': 0, 'terminal': 0, 'computer-use': 0, 'stress': 0 };
  for (const profile of profilesInData) {
    const meta = PROFILE_META[profile];
    if (meta) typeCounts[meta.agentType] = (typeCounts[meta.agentType] ?? 0) + 1;
  }

  const stats = [
    {
      label: 'Total Runs',
      value: totalRuns,
      suffix: isFiltered ? ` / ${allData.length}` : '',
    },
    {
      label: 'Hardware Configs',
      value: hwConfigs,
      suffix: isFiltered ? ` / ${allHwConfigs}` : '',
    },
    {
      label: 'Models Tested',
      value: models,
      suffix: isFiltered ? ` / ${allModels}` : '',
    },
  ];

  const typeLabels: Array<{ key: string; short: string }> = [
    { key: 'chat', short: 'Chat' },
    { key: 'coding', short: 'Coding' },
    { key: 'terminal', short: 'Terminal' },
    { key: 'computer-use', short: 'Computer Use' },
    { key: 'stress', short: 'Stress' },
  ];

  return (
    <div className="animate-fade-up mb-12 overflow-hidden rounded-3xl border border-[#e8e8ed] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
      <div className="grid grid-cols-1 divide-y divide-[#e8e8ed] sm:grid-cols-3 sm:divide-y-0 sm:divide-x">
        {stats.map((stat) => (
          <div key={stat.label} className="px-8 py-7">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-[#86868b]">
              {stat.label}
            </div>
            <div className="text-[40px] font-semibold leading-none tracking-tight tabular-nums text-[#1d1d1f]">
              {stat.value}
              {stat.suffix && (
                <span className="ml-1.5 text-[15px] font-normal tracking-normal text-[#6e6e73]">{stat.suffix}</span>
              )}
            </div>
          </div>
        ))}
      </div>
      {profilesInData.size > 0 && (
        <div className="flex flex-wrap items-center gap-2.5 border-t border-[#e8e8ed] bg-[#fafafa] px-8 py-4">
          <span className="text-[11px] font-semibold uppercase tracking-widest text-[#86868b]">Workload mix</span>
          {typeLabels.map(({ key, short }) => {
            const count = typeCounts[key] ?? 0;
            if (count === 0) return null;
            const colors = AGENT_TYPE_COLORS[key] ?? { bg: 'rgba(139,148,158,0.12)', text: '#6e6e73', border: 'rgba(139,148,158,0.3)' };
            return (
              <span
                key={key}
                className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium"
                style={{ backgroundColor: colors.bg, color: colors.text, borderColor: colors.border }}
              >
                <span className="font-mono font-semibold tabular-nums">{count}</span>
                {short}
              </span>
            );
          })}
          <span className="ml-auto text-[12px] text-[#86868b]">
            {profilesInData.size} profile{profilesInData.size !== 1 ? 's' : ''}
          </span>
        </div>
      )}
    </div>
  );
}
