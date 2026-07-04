import { useLayoutEffect, useRef, useState } from 'react';
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
  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [thumb, setThumb] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const measure = () => {
      const el = buttonRefs.current[active];
      if (el) setThumb({ left: el.offsetLeft, width: el.offsetWidth });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [active]);

  return (
    <div role="tablist" aria-label="Chart view" className="seg-track relative mb-8 inline-flex">
      {thumb && (
        <div
          aria-hidden
          className="seg-item-active absolute top-[3px] bottom-[3px] transition-[left,width] duration-300 ease-out"
          style={{ left: thumb.left, width: thumb.width }}
        />
      )}
      {TABS.map((tab) => (
        <button
          key={tab.id}
          ref={(el) => {
            buttonRefs.current[tab.id] = el;
          }}
          role="tab"
          aria-selected={active === tab.id}
          onClick={() => onChange(tab.id)}
          className={`seg-item relative z-10 whitespace-nowrap px-4 py-1.5 text-[13px] font-medium ${
            active === tab.id ? 'text-[#1d1d1f]' : 'text-[#6e6e73] hover:text-[#1d1d1f]'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
