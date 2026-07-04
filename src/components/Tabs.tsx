import type { TabId } from '../types';

interface TabsProps {
  active: TabId;
  onChange: (tab: TabId) => void;
}

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'latency', label: 'Latency' },
  { id: 'throughput', label: 'Throughput' },
  { id: 'comparison', label: 'Comparison' },
  { id: 'multi-turn', label: 'Multi-Turn' },
  { id: 'raw', label: 'Raw Data' },
];

export function Tabs({ active, onChange }: TabsProps) {
  return (
    <div className="mb-6 flex gap-1 border-b border-[#e8e8ed]">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`px-4 py-2.5 text-sm font-medium transition-all ${
            active === tab.id
              ? 'border-b-2 border-[#0071e3] text-[#1d1d1f]'
              : 'border-b-2 border-transparent text-[#6e6e73] hover:text-[#424245]'
          }`}
          style={{ marginBottom: '-1px' }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
