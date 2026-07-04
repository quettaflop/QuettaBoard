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
      className={`flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
        activePage === page.id
          ? 'bg-[#0071e3]/12 text-[#0071e3]'
          : 'text-[#6e6e73] hover:bg-[#e8e8ed] hover:text-[#424245]'
      }`}
    >
      {page.icon}
      {page.label}
      {page.badge && (
        <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold tracking-wide text-amber-700">
          {page.badge}
        </span>
      )}
    </button>
  );

  return (
    <div className="min-h-screen bg-[#f5f5f7] text-[#1d1d1f]" aria-busy={loading || scopePending}>
      {/* Sticky nav */}
      <nav className="sticky top-0 z-50 border-b border-[#e8e8ed] bg-[#ffffff]/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6">
          {/* Left: logo + page switcher */}
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <button
              type="button"
              onClick={() => onPageChange('benchmark')}
              aria-label="Home"
              className="flex shrink-0 items-center gap-3 rounded-md text-left transition-colors hover:text-[#0071e3] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/50"
            >
              <div
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0071e3]/15 text-[#0071e3]"
                style={{ boxShadow: '0 0 0 1px rgba(0,0,0,0.06), 0 0 8px rgba(0,0,0,0.03)' }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                </svg>
              </div>
              <h1 className="hidden text-base font-semibold tracking-tight md:block lg:text-lg">
                QuettaBoard
              </h1>
            </button>

            {/* Page nav pills */}
            <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
              {NAV_PAGES.map(renderNavButton)}
            </div>
          </div>

          {/* Right: status */}
          <div className="hidden shrink-0 items-center gap-3 text-sm text-[#6e6e73] lg:flex">
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[#ff9f0a]" />
                Loading...
              </span>
            ) : scopePending ? (
              <span className="flex items-center gap-2">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[#0071e3]" />
                Updating view...
              </span>
            ) : activePage === 'simulator' ? (
              <span className="flex items-center gap-2">
                <span className="inline-block h-2 w-2 rounded-full bg-[#0071e3]" />
                Simulator target loaded
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <span className="inline-block h-2 w-2 rounded-full bg-[#34c759]" />
                <span className="font-mono">{totalRuns}</span> runs loaded
              </span>
            )}
          </div>
        </div>

        {activePage === 'benchmark' && (
        <div className="border-t border-[#e8e8ed] bg-[#f5f5f7]">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-xs sm:px-6">
            <ScopeSwitcher
              dataScope={dataScope}
              onDataScopeChange={onDataScopeChange}
              className="mr-1 max-w-full overflow-x-auto"
              compact
            />
            <span
              className="font-semibold uppercase tracking-wide"
              style={{ color: scopeMeta.accent }}
            >
              {scopeMeta.label}
            </span>
            <span className="text-[#86868b]">{scopeMeta.eyebrow}</span>
            <span className="hidden text-[#6e6e73] md:inline">{scopeMeta.description}</span>
            <span className="ml-auto hidden font-mono text-[#86868b] sm:inline">
              {totalRuns} {scopeMeta.rowsLabel}
            </span>
          </div>
        </div>
        )}
      </nav>

      {/* Main content */}
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
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
    <div className={`inline-flex items-center rounded-md border border-[#d2d2d7] bg-[#f5f5f7] p-0.5 ${className}`}>
      {DATA_SCOPE_OPTIONS.map((scope) => {
        const meta = DATA_SCOPE_META[scope];
        const selected = dataScope === scope;
        return (
          <button
            key={scope}
            onClick={() => onDataScopeChange(scope)}
            aria-pressed={selected}
            title={meta.description}
            className={`rounded-full px-2.5 py-1 text-left text-xs font-medium transition-colors ${
              selected
                ? 'text-white'
                : 'text-[#6e6e73] hover:bg-[#e8e8ed] hover:text-[#1d1d1f]'
            }`}
            style={{
              backgroundColor: selected ? meta.accent : undefined,
              color: selected ? '#ffffff' : undefined,
            }}
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
