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
    <div className="glass animate-fade-up mb-12 overflow-hidden rounded-[26px]">
      <div className="grid grid-cols-1 divide-y divide-white/10 sm:grid-cols-3 sm:divide-y-0 sm:divide-x">
        {stats.map((stat) => (
          <div key={stat.label} className="px-8 py-7">
            <div className="mb-3 font-mono text-[10.5px] font-medium uppercase tracking-[0.14em] text-[#676c76]">
              {stat.label}
            </div>
            <div className="mono-nums text-[34px] font-medium leading-none tracking-[-0.02em] text-[#f3f4f6]">
              {stat.value}
              {stat.suffix && (
                <span className="ml-1 text-[15px] font-normal tracking-normal text-[#676c76]">{stat.suffix}</span>
              )}
            </div>
          </div>
        ))}
      </div>
      {profilesInData.size > 0 && (
        <div className="flex flex-wrap items-center gap-2.5 border-t border-white/10 bg-white/[0.04] px-8 py-4">
          <span className="text-[11px] font-semibold uppercase tracking-widest text-[#676c76]">Workload mix</span>
          {typeLabels.map(({ key, short }) => {
            const count = typeCounts[key] ?? 0;
            if (count === 0) return null;
            const colors = AGENT_TYPE_COLORS[key] ?? { bg: 'rgba(139,148,158,0.12)', text: '#a9afba', border: 'rgba(139,148,158,0.3)' };
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
          <span className="ml-auto text-[12px] text-[#676c76]">
            {profilesInData.size} profile{profilesInData.size !== 1 ? 's' : ''}
          </span>
        </div>
      )}
    </div>
  );
}
