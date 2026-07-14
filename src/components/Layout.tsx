import type { ReactNode } from 'react';
import {
  DATA_SCOPE_META,
  DATA_SCOPE_OPTIONS,
  type DataScope,
} from '../profileMeta';
import { INTERNAL } from '../env';
import brandMark from '../assets/quettaflop-icon-white.png';

type PageId = 'benchmark' | 'matrix' | 'simulator_v2' | 'gpu' | 'coverage';
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
  // Internal-only nav entries. In a public build `INTERNAL` folds to a
  // compile-time `false`, so these are dropped and the site shows no dead links.
  ...(INTERNAL
    ? ([
        {
          id: 'matrix',
          label: 'Matrix',
          icon: (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M3 9h18" />
              <path d="M3 15h18" />
              <path d="M9 3v18" />
              <path d="M15 3v18" />
            </svg>
          ),
        },
        {
          id: 'simulator_v2',
          label: 'Simulator v2',
          badge: 'WIP',
          icon: (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2 2 7l10 5 10-5-10-5Z" />
              <path d="m2 17 10 5 10-5" />
              <path d="m2 12 10 5 10-5" />
            </svg>
          ),
        },
        {
          id: 'gpu',
          label: 'GPU',
          icon: (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="4" width="16" height="16" rx="2" />
              <rect x="9" y="9" width="6" height="6" />
              <path d="M9 2v2" />
              <path d="M15 2v2" />
              <path d="M9 20v2" />
              <path d="M15 20v2" />
              <path d="M2 9h2" />
              <path d="M2 15h2" />
              <path d="M20 9h2" />
              <path d="M20 15h2" />
            </svg>
          ),
        },
        {
          id: 'coverage',
          label: 'Coverage',
          icon: (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <path d="m14 16 2 2 4-4" />
            </svg>
          ),
        },
      ] satisfies NavPage[])
    : []),
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
          ? 'text-[#f3f4f6]'
          : 'text-[#a9afba] hover:text-[#f3f4f6]'
      }`}
    >
      {page.icon}
      {page.label}
      {page.badge && (
        <span className="rounded-full bg-[#ff9f0a]/15 px-1.5 py-0.5 text-[9px] font-semibold tracking-wide text-[#f7b955]">
          {page.badge}
        </span>
      )}
    </button>
  );

  return (
    <div className="min-h-screen text-[#f3f4f6]" aria-busy={loading || scopePending}>
      {/* Sticky frosted nav — strongest glass in the app */}
      <nav className="glass-strong sticky top-0 z-50">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6">
          {/* Left: logo + page switcher */}
          <div className="flex min-w-0 flex-1 items-center gap-4">
            <button
              type="button"
              onClick={() => onPageChange('benchmark')}
              aria-label="Home"
              className="flex shrink-0 items-center gap-2.5 rounded-full text-left transition-opacity hover:opacity-70 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2dd4bf]/50"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-[#0d0f13] ring-1 ring-inset ring-white/10">
                <img src={brandMark} alt="QuettaFlop" className="h-5 w-5" draggable={false} />
              </div>
              <h1 className="hidden text-[15px] font-semibold tracking-tight text-[#f3f4f6] md:block">
                QuettaBoard
              </h1>
            </button>

            <div className="h-5 w-px shrink-0 bg-[#ffffff1f]" />

            {/* Page nav */}
            <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
              {NAV_PAGES.map(renderNavButton)}
            </div>
          </div>

          {/* Right: status */}
          <div className="hidden shrink-0 items-center gap-3 text-[12px] text-[#a9afba] lg:flex">
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[#ff9f0a]" />
                Loading…
              </span>
            ) : scopePending ? (
              <span className="flex items-center gap-2">
                <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[#2dd4bf]" />
                Updating view…
              </span>
            ) : activePage === 'simulator_v2' ? (
              <span className="flex items-center gap-2">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#2dd4bf]" />
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
        <div className="border-t border-white/10">
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
            <span className="hidden text-[12px] text-[#a9afba] md:inline">{scopeMeta.description}</span>
            <span className="ml-auto hidden font-mono text-[11px] tabular-nums text-[#676c76] sm:inline">
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
              selected ? 'seg-item-active' : 'text-[#a9afba] hover:text-[#f3f4f6]'
            }`}
          >
            <span className="whitespace-nowrap">{compact ? meta.shortLabel : meta.shortLabel}</span>
            {!compact && (
              <span className="ml-1 hidden text-[10px] font-normal text-[#a9afba] xl:inline">
                {meta.eyebrow}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
