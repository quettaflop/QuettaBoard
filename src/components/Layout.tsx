import type { ReactNode } from 'react';
import {
  DATA_SCOPE_META,
  DATA_SCOPE_OPTIONS,
  type DataScope,
} from '../profileMeta';

type PageId = 'benchmark' | 'simulator';
type NavPage = { id: PageId; label: string; icon: ReactNode; badge?: string };

interface LayoutProps {
  children: ReactNode;
  totalRuns: number;
  loading: boolean;
  activePage: PageId;
  onPageChange: (page: PageId) => void;
  dataScope: DataScope;
  onDataScopeChange: (scope: DataScope) => void;
  scopePending?: boolean;
}

const NAV_PAGES: NavPage[] = [
  {
    id: 'benchmark',
    label: 'Home',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
  },
  {
    id: 'simulator',
    label: 'Simulator',
    badge: 'WIP',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 19V5" />
        <path d="M4 19h16" />
        <path d="M7 15h3" />
        <path d="M12 11h3" />
        <path d="M17 7h3" />
      </svg>
    ),
  },
];

export function Layout({
  children,
  totalRuns,
  loading,
  activePage,
  onPageChange,
  dataScope,
  onDataScopeChange,
  scopePending = false,
}: LayoutProps) {
  const scopeMeta = DATA_SCOPE_META[dataScope];

  const renderNavButton = (page: NavPage) => (
    <button
      key={page.id}
      onClick={() => onPageChange(page.id)}
      className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors ${
        activePage === page.id
          ? 'text-[#1d1d1f]'
          : 'text-[#6e6e73] hover:text-[#1d1d1f]'
      }`}
    >
      {page.icon}
      {page.label}
      {page.badge && (
        <span className="rounded-full bg-[#ff9f0a]/15 px-1.5 py-0.5 text-[9px] font-semibold tracking-wide text-[#9a5b00]">
          {page.badge}
        </span>
      )}
    </button>
  );

  return (
    <div className="min-h-screen bg-[#f5f5f7] text-[#1d1d1f]" aria-busy={loading || scopePending}>
      {/* Sticky frosted nav */}
      <nav className="sticky top-0 z-50 border-b border-[#d2d2d7]/60 bg-white/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6">
          {/* Left: logo + page switcher */}
          <div className="flex min-w-0 flex-1 items-center gap-4">
            <button
              type="button"
              onClick={() => onPageChange('benchmark')}
              aria-label="Home"
              className="flex shrink-0 items-center gap-2.5 rounded-full text-left transition-opacity hover:opacity-70 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0071e3]/50"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#0071e3]/10 text-[#0071e3]">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                </svg>
              </div>
              <h1 className="hidden text-[15px] font-semibold tracking-tight text-[#1d1d1f] md:block">
                QuettaBoard
              </h1>
            </button>

            <div className="h-5 w-px shrink-0 bg-[#d2d2d7]" />

            {/* Page nav */}
            <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
              {NAV_PAGES.map(renderNavButton)}
            </div>
          </div>

          {/* Right: status */}
          <div className="hidden shrink-0 items-center gap-3 text-[12px] text-[#6e6e73] lg:flex">
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[#ff9f0a]" />
                Loading…
              </span>
            ) : scopePending ? (
              <span className="flex items-center gap-2">
                <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[#0071e3]" />
                Updating view…
              </span>
            ) : activePage === 'simulator' ? (
              <span className="flex items-center gap-2">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#0071e3]" />
                Simulator target loaded
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#34c759]" />
                <span className="font-mono tabular-nums">{totalRuns}</span> runs loaded
              </span>
            )}
          </div>
        </div>

        {activePage === 'benchmark' && (
        <div className="border-t border-[#d2d2d7]/60 bg-white">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 sm:px-6">
            <ScopeSwitcher
              dataScope={dataScope}
              onDataScopeChange={onDataScopeChange}
              className="max-w-full overflow-x-auto"
              compact
            />
            <span
              className="text-[11px] font-semibold uppercase tracking-wide"
              style={{ color: scopeMeta.accent }}
            >
              {scopeMeta.eyebrow}
            </span>
            <span className="hidden text-[12px] text-[#6e6e73] md:inline">{scopeMeta.description}</span>
            <span className="ml-auto hidden font-mono text-[11px] tabular-nums text-[#86868b] sm:inline">
              {totalRuns} {scopeMeta.rowsLabel}
            </span>
          </div>
        </div>
        )}
      </nav>

      {/* Main content */}
      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-12">
        {children}
      </main>
    </div>
  );
}

function ScopeSwitcher({
  dataScope,
  onDataScopeChange,
  className = '',
  compact = false,
}: {
  dataScope: DataScope;
  onDataScopeChange: (scope: DataScope) => void;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={`seg-track ${className}`}>
      {DATA_SCOPE_OPTIONS.map((scope) => {
        const meta = DATA_SCOPE_META[scope];
        const selected = dataScope === scope;
        return (
          <button
            key={scope}
            onClick={() => onDataScopeChange(scope)}
            aria-pressed={selected}
            title={meta.description}
            className={`seg-item whitespace-nowrap px-3 py-1 text-left text-[12px] font-medium ${
              selected ? 'seg-item-active' : 'text-[#6e6e73] hover:text-[#1d1d1f]'
            }`}
          >
            <span className="whitespace-nowrap">{compact ? meta.shortLabel : meta.shortLabel}</span>
            {!compact && (
              <span className="ml-1 hidden text-[10px] font-normal text-[#6e6e73] xl:inline">
                {meta.eyebrow}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
