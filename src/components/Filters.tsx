import { useCallback, useMemo, useState } from 'react';
import type { FilterState, FilterOptions } from '../types';
import {
  PROFILE_META,
  AGENT_TYPE_COLORS,
  DATA_SOURCE_COLORS,
  FALLBACK_META_COLORS,
  profileDisplayName,
  SYNTHETIC_PROFILES,
  ARCHIVE_PROFILES,
  ARCHIVED_PROFILES,
  type DataScope,
} from '../profileMeta';

interface FiltersProps {
  filters: FilterState;
  options: FilterOptions;
  dataScope: DataScope;
  onToggle: (category: keyof FilterState, value: string) => void;
  onClear: () => void;
}

const CATEGORY_COLORS: Record<keyof FilterState, string> = {
  hardware: '#0071e3',
  model: '#ff9f0a',
  backend: '#a855f7',
  agentType: '#34c759',
  turnStyle: '#e78bfa',
  profile: '#0071e3',
};

const PROFILE_GROUP_ORDER = [
  'Synthetic chat ST',
  'Synthetic chat MT',
  'Synthetic coding MT',
  'Synthetic terminal MT',
  'Synthetic computer-use MT',
  'Natural chat ST',
  'Natural chat MT',
  'Agentic coding ST',
  'Agentic coding MT',
  'Agentic terminal MT',
  'Computer-use MT',
  'MSE validation',
  'Agentic coding',
  'Agentic terminal',
  'Computer-use',
  'Stress',
  'Legacy chat ST',
];

const PROFILE_ORDER = [
  'chat-singleturn',
  'chat-singleturn-synth',
  'coding-singleturn',
  'chat-multiturn',
  'chat-multiturn-synth',
  'swebench-multiturn',
  'swebench-multiturn-synth',
  'swebench-multiturn-mse',
  'swebench-multiturn-short',
  'terminalbench-multiturn',
  'terminalbench-multiturn-synth',
  'terminalbench-multiturn-mse',
  'terminalbench-multiturn-short',
  'osworld-multiturn',
  'osworld-multiturn-synth',
  'osworld-multiturn-mse',
  'osworld-multiturn-short',
  'chat-short',
  'chat-medium',
  'fixed-seq128',
  'prefill-heavy',
  'decode-heavy',
  'random-1k',
  'chat-multiturn-short',
  'chat-multiturn-medium',
  'chat-multiturn-long',
  'swebench-multiturn-short',
  'swebench-multiturn-medium',
  'swebench-multiturn-long',
  'terminalbench-multiturn-short',
  'terminalbench-multiturn-medium',
  'terminalbench-multiturn-long',
  'osworld-multiturn-short',
  'osworld-multiturn-medium',
  'osworld-multiturn-long',
];

const GROUP_LABELS: Record<string, string> = {
  'Synthetic chat ST': 'Synthetic chat',
  'Synthetic chat MT': 'Synthetic chat, multi-turn',
  'Synthetic coding MT': 'Synthetic coding, multi-turn',
  'Synthetic terminal MT': 'Synthetic terminal, multi-turn',
  'Synthetic computer-use MT': 'Synthetic computer-use, multi-turn',
  'Natural chat ST': 'Natural chat',
  'Natural chat MT': 'Natural chat, multi-turn',
  'Agentic coding ST': 'Agentic coding',
  'Agentic coding MT': 'Agentic coding, multi-turn',
  'Agentic terminal MT': 'Agentic terminal, multi-turn',
  'Computer-use MT': 'Computer-use, multi-turn',
  'MSE validation': 'MSE validation pairs',
  'Agentic coding': 'Agentic coding',
  'Agentic terminal': 'Agentic terminal',
  'Computer-use': 'Computer-use',
  Stress: 'Stress',
  'Legacy chat ST': 'Legacy chat',
};

const GROUP_ACCENTS: Record<string, string> = {
  'Synthetic chat ST': '#34c759',
  'Synthetic chat MT': '#34c759',
  'Synthetic coding MT': '#0071e3',
  'Synthetic terminal MT': '#ff3b30',
  'Synthetic computer-use MT': '#ec4899',
  'Natural chat ST': '#34c759',
  'Natural chat MT': '#34c759',
  'Agentic coding ST': '#0071e3',
  'Agentic coding MT': '#0071e3',
  'Agentic terminal MT': '#ff3b30',
  'Computer-use MT': '#ec4899',
  'MSE validation': '#ff9f0a',
  'Agentic coding': '#0071e3',
  'Agentic terminal': '#ff3b30',
  'Computer-use': '#ec4899',
  Stress: '#ff9f0a',
  'Legacy chat ST': '#6e6e73',
};

interface MetaBadgeProps {
  label: string;
  colors: { bg: string; text: string; border: string };
}

function MetaBadge({ label, colors }: MetaBadgeProps) {
  return (
    <span
      className="inline-flex h-5 items-center rounded border px-1.5 text-[10px] font-medium"
      style={{ backgroundColor: colors.bg, color: colors.text, borderColor: colors.border }}
    >
      {label}
    </span>
  );
}

function PillRow({
  category,
  values,
  active,
  onToggle,
}: {
  category: keyof FilterState;
  values: string[];
  active: string[];
  onToggle: (cat: keyof FilterState, val: string) => void;
}) {
  const color = CATEGORY_COLORS[category];
  return (
    <div className="flex flex-wrap gap-1.5">
      {values.map((value) => {
        const isActive = active.includes(value);
        return (
          <button
            key={value}
            onClick={() => onToggle(category, value)}
            className="min-h-[30px] rounded-full border px-3 text-[12px] font-medium transition-colors"
            style={{
              borderColor: isActive ? color : '#d2d2d7',
              backgroundColor: isActive ? `${color}18` : 'rgba(255,255,255,0.02)',
              color: isActive ? color : '#6e6e73',
            }}
          >
            {value}
          </button>
        );
      })}
    </div>
  );
}

function SectionHeader({ label, accent }: { label: string; accent: string }) {
  return (
    <div className="mb-2.5 flex items-center gap-2">
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: accent }} />
      <span className="text-[11px] font-semibold uppercase tracking-widest text-[#86868b]">
        {label}
      </span>
    </div>
  );
}

function FilterGroup({
  label,
  category,
  values,
  active,
  onToggle,
}: {
  label: string;
  category: keyof FilterState;
  values: string[];
  active: string[];
  onToggle: (cat: keyof FilterState, val: string) => void;
}) {
  return (
    <div>
      <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-[#86868b]">{label}</div>
      <PillRow category={category} values={values} active={active} onToggle={onToggle} />
    </div>
  );
}

function profileRank(profile: string): number {
  const index = PROFILE_ORDER.indexOf(profile);
  return index === -1 ? 10_000 : index;
}

function groupRank(group: string): number {
  const index = PROFILE_GROUP_ORDER.indexOf(group);
  return index === -1 ? 10_000 : index;
}

function turnBadgeLabel(turnStyle: string) {
  return turnStyle === 'multi-turn' ? 'MT' : 'ST';
}

export function Filters({ filters, options, dataScope, onToggle, onClear }: FiltersProps) {
  const [expandedProfile, setExpandedProfile] = useState<string | null>(null);
  const [profileQuery, setProfileQuery] = useState('');
  const hasActiveFilters = Object.values(filters).some((arr) => arr.length > 0);
  const normalizedQuery = profileQuery.trim().toLowerCase();

  const allProfiles = useMemo(
    () => Array.from(
      dataScope === 'trace_replay' ? ARCHIVE_PROFILES :
      dataScope === 'synthetic_distributional' ? SYNTHETIC_PROFILES :
      ARCHIVED_PROFILES,
    )
      .filter((profile) => PROFILE_META[profile])
      .sort((a, b) => profileRank(a) - profileRank(b) || a.localeCompare(b)),
    [dataScope],
  );

  const profileMatchesFilters = useCallback((profileName: string): boolean => {
    const meta = PROFILE_META[profileName];
    if (!meta) return false;
    if (filters.agentType.length > 0 && !filters.agentType.includes(meta.agentType)) return false;
    if (filters.turnStyle.length > 0 && !filters.turnStyle.includes(meta.turnStyle)) return false;
    if (normalizedQuery) {
      const haystack = [
        profileName,
        meta.displayName,
        meta.workloadGroup,
        meta.agentType,
        meta.turnStyle,
        meta.dataSource,
      ].join(' ').toLowerCase();
      if (!haystack.includes(normalizedQuery)) return false;
    }
    return true;
  }, [filters.agentType, filters.turnStyle, normalizedQuery]);

  const profileGroups = useMemo(() => {
    const groups = new Map<string, string[]>();
    for (const profileName of allProfiles) {
      const meta = PROFILE_META[profileName];
      if (!meta) continue;
      const isSelected = filters.profile.includes(profileName);
      const matches = profileMatchesFilters(profileName);
      if (!matches && !isSelected) continue;
      const group = meta.workloadGroup;
      groups.set(group, [...(groups.get(group) ?? []), profileName]);
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => groupRank(a) - groupRank(b) || a.localeCompare(b))
      .map(([group, profiles]) => ({
        group,
        profiles: profiles.sort((a, b) => profileRank(a) - profileRank(b) || a.localeCompare(b)),
      }));
  }, [allProfiles, filters.profile, profileMatchesFilters]);

  const visibleCount = profileGroups.reduce((sum, group) => sum + group.profiles.length, 0);
  const selectedProfileCount = filters.profile.length;

  return (
    <div className="glass mb-10 rounded-[24px] p-6 sm:p-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[15px] font-semibold tracking-tight text-[#1d1d1f]">Filters</div>
          <div className="mt-0.5 text-[12px] text-[#6e6e73]">
            {selectedProfileCount > 0 ? `${selectedProfileCount} profile${selectedProfileCount === 1 ? '' : 's'} selected` : `${visibleCount} profiles`}
          </div>
        </div>
        {hasActiveFilters && (
          <button
            onClick={onClear}
            className="min-h-8 rounded-full border border-[#d2d2d7] px-3 text-[12px] font-medium text-[#6e6e73] transition-colors hover:border-[#86868b] hover:text-[#1d1d1f]"
          >
            Clear all
          </button>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(280px,2fr)]">
        <section className="border-t border-white/60 pt-4">
          <SectionHeader label="Infrastructure" accent="#0071e3" />
          <div className="grid gap-4 md:grid-cols-3">
            <FilterGroup
              label="Hardware"
              category="hardware"
              values={options.hardware}
              active={filters.hardware}
              onToggle={onToggle}
            />
            <FilterGroup
              label="Model"
              category="model"
              values={options.model}
              active={filters.model}
              onToggle={onToggle}
            />
            <FilterGroup
              label="Backend"
              category="backend"
              values={options.backend}
              active={filters.backend}
              onToggle={onToggle}
            />
          </div>
        </section>

        <section className="border-t border-white/60 pt-4">
          <SectionHeader label="Workload Tags" accent="#34c759" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <FilterGroup
              label="Agent Type"
              category="agentType"
              values={options.agentType}
              active={filters.agentType}
              onToggle={onToggle}
            />
            <FilterGroup
              label="Turn Style"
              category="turnStyle"
              values={options.turnStyle}
              active={filters.turnStyle}
              onToggle={onToggle}
            />
          </div>
        </section>
      </div>

      <section className="mt-5 border-t border-white/60 pt-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <SectionHeader label="Profiles" accent="#0071e3" />
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-[#6e6e73]">
              {visibleCount} of {allProfiles.length}
            </span>
            <input
              value={profileQuery}
              onChange={(e) => setProfileQuery(e.target.value)}
              className="h-8 w-44 rounded-full border border-[#d2d2d7] bg-[#f5f5f7] px-3 text-[12px] text-[#1d1d1f] outline-none transition-colors placeholder:text-[#86868b] focus:border-[#0071e3]"
              placeholder="Search profiles"
            />
          </div>
        </div>

        <div className="relative rounded-[20px] border border-[#d2d2d7] bg-[#f5f5f7]">
          <div className="pointer-events-none absolute left-0 right-3 top-0 z-10 h-5 rounded-t-[20px] bg-gradient-to-b from-[#f5f5f7] to-transparent" />
          <div
            className="profile-scrollbar max-h-[420px] overflow-y-scroll p-2 pr-3"
            style={{ paddingBottom: '3rem', scrollPaddingBottom: '3rem' }}
          >
            <div className="grid gap-3 xl:grid-cols-2">
              {profileGroups.map(({ group, profiles }) => {
                const accent = GROUP_ACCENTS[group] ?? '#6e6e73';
                return (
                  <div key={group} className="rounded-xl border border-[#e8e8ed] bg-white">
                    <div className="flex items-center justify-between border-b border-[#e8e8ed] px-3 py-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: accent }} />
                        <span className="truncate text-xs font-semibold text-[#1d1d1f]">
                          {GROUP_LABELS[group] ?? group}
                        </span>
                      </div>
                      <span className="shrink-0 text-[10px] text-[#6e6e73]">{profiles.length}</span>
                    </div>

                    <div className="divide-y divide-[#e8e8ed]/70">
                      {profiles.map((profileName) => {
                        const meta = PROFILE_META[profileName];
                        const displayName = profileDisplayName(profileName);
                        const isSelected = filters.profile.includes(profileName);
                        const matches = profileMatchesFilters(profileName);
                        const agentColors = meta ? (AGENT_TYPE_COLORS[meta.agentType] || FALLBACK_META_COLORS) : FALLBACK_META_COLORS;
                        const dsColors = meta ? (DATA_SOURCE_COLORS[meta.dataSource] || FALLBACK_META_COLORS) : FALLBACK_META_COLORS;
                        const isExpanded = expandedProfile === profileName;

                        return (
                          <div key={profileName}>
                            <div
                              className="flex items-stretch transition-colors"
                              style={{
                                backgroundColor: isSelected ? 'rgba(0,113,227,0.08)' : 'transparent',
                                opacity: matches ? 1 : 0.42,
                              }}
                            >
                              <button
                                onClick={() => onToggle('profile', profileName)}
                                className="min-w-0 flex-1 px-3 py-2 text-left"
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <div
                                      className="truncate text-xs font-medium"
                                      style={{ color: isSelected ? '#0071e3' : '#1d1d1f' }}
                                      title={displayName}
                                    >
                                      {displayName}
                                    </div>
                                    {meta && (
                                      <div className="mt-1 flex flex-wrap items-center gap-1">
                                        <MetaBadge label={turnBadgeLabel(meta.turnStyle)} colors={FALLBACK_META_COLORS} />
                                        <MetaBadge label={meta.agentType} colors={agentColors} />
                                        <MetaBadge label={meta.dataSource} colors={dsColors} />
                                      </div>
                                    )}
                                  </div>
                                  {meta && (
                                    <div className="shrink-0 text-right text-[10px] leading-4 text-[#6e6e73]">
                                      <div>{meta.isl}</div>
                                      <div>{meta.osl}</div>
                                    </div>
                                  )}
                                </div>
                              </button>

                              {meta?.description && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setExpandedProfile(isExpanded ? null : profileName);
                                  }}
                                  className="flex w-9 shrink-0 items-center justify-center border-l border-[#e8e8ed] text-[#6e6e73] transition-colors hover:bg-[#e8e8ed] hover:text-[#1d1d1f]"
                                  title="Show workload description"
                                >
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="12" cy="12" r="10" />
                                    <line x1="12" y1="16" x2="12" y2="12" />
                                    <line x1="12" y1="8" x2="12.01" y2="8" />
                                  </svg>
                                </button>
                              )}
                            </div>

                            {isExpanded && meta?.description && (
                              <div className="border-t border-[#e8e8ed] bg-[#ffffff] px-3 py-2 text-[11px] leading-relaxed text-[#6e6e73]">
                                {meta.description}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {profileGroups.length === 0 && (
              <div className="rounded-xl border border-[#e8e8ed] bg-white px-3 py-6 text-center text-xs text-[#6e6e73]">
                No profiles match the current filters.
              </div>
            )}
          </div>
          <div className="pointer-events-none absolute bottom-0 left-0 right-3 z-10 flex h-9 items-end justify-center rounded-b-[20px] bg-gradient-to-t from-[#f5f5f7] via-[#f5f5f7]/85 to-transparent pb-1.5">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0071e3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.8">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </div>
        </div>
      </section>
    </div>
  );
}
