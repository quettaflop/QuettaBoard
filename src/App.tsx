import { lazy, Suspense, useCallback, useEffect, useState, useTransition } from 'react';
import { useData } from './hooks/useData';
import { useSweepState } from './hooks/useSweepState';
import { Layout } from './components/Layout';
import { KPICards } from './components/KPICards';
import { Filters } from './components/Filters';
import { Tabs } from './components/Tabs';
import { LatencyChart } from './components/charts/LatencyChart';
import { ThroughputChart } from './components/charts/ThroughputChart';
import { ComparisonChart } from './components/charts/ComparisonChart';
import { PerTurnChart } from './components/charts/PerTurnChart';
import { DataTable } from './components/DataTable';
import { simulatorPredictionsJsonUrl, simulatorV2SimPredictionsJsonUrl } from './dataUrls';
import { INTERNAL } from './env';
import type { TabId } from './types';
import { normalizeDataScope, type DataScope } from './profileMeta';
import './index.css';

// Internal-only page (simulator; future gpu/profiling orchestration lives here
// too). Loaded via a gated dynamic import so a public build — where `INTERNAL`
// folds to a compile-time `false` — dead-code-eliminates the `import()` and
// Rollup never emits the chunk. Named export -> default interop for React.lazy.
const ServingPredictionsPage = INTERNAL
  ? lazy(() =>
      import('./components/ServingPredictionsPage').then((m) => ({
        default: m.ServingPredictionsPage,
      })),
    )
  : null;

// GPU fleet control + predictions matrix are internal-only too, gated the same
// way so a public build dead-code-eliminates the `import()` and never emits the
// chunk. Named export -> default interop for React.lazy.
const GpuStatePage = INTERNAL
  ? lazy(() =>
      import('./components/GpuStatePage').then((m) => ({
        default: m.GpuStatePage,
      })),
    )
  : null;

const PredictionsMatrixPage = INTERNAL
  ? lazy(() =>
      import('./components/PredictionsMatrixPage').then((m) => ({
        default: m.PredictionsMatrixPage,
      })),
    )
  : null;

const CoveragePage = INTERNAL
  ? lazy(() =>
      import('./components/CoveragePage').then((m) => ({
        default: m.CoveragePage,
      })),
    )
  : null;

type PageId = 'benchmark' | 'matrix' | 'simulator_v2' | 'gpu' | 'coverage';
const PAGE_IDS: PageId[] = INTERNAL
  ? ['benchmark', 'matrix', 'simulator_v2', 'gpu', 'coverage']
  : ['benchmark'];
const DATA_SCOPE_STORAGE_KEY = 'inference-dashboard-data-scope';

function initialDataScope(): DataScope {
  // Synthetic (distributional) is the default landing scope. An explicit ?scope=
  // URL param still overrides it; localStorage no longer shadows the default (so
  // a prior selection doesn't stick as the default on the next load).
  const urlScope = normalizeDataScope(new URLSearchParams(window.location.search).get('scope'));
  return urlScope ?? 'synthetic_distributional';
}

function hashPage(): PageId | null {
  const hashPage = window.location.hash.replace(/^#\/?/, '');
  return PAGE_IDS.includes(hashPage as PageId) ? (hashPage as PageId) : null;
}

function initialPage(): PageId {
  return hashPage() ?? 'benchmark';
}

function pageUrl(page: PageId): string {
  const url = new URL(window.location.href);
  url.hash = page === 'benchmark' ? '' : page;
  return `${url.pathname}${url.search}${url.hash}`;
}

function App() {
  const [dataScope, setDataScopeState] = useState<DataScope>(initialDataScope);
  const [activePage, setActivePageState] = useState<PageId>(initialPage);
  const [activeTab, setActiveTab] = useState<TabId>('latency');
  const [scopePending, startScopeTransition] = useTransition();
  // The coverage page on the synthetic scope is driven by the compact coverage
  // artifact + sweep-state and does NOT need the (large) benchmark data.json;
  // other scopes fall back to benchmark rows. Only the benchmark page derives
  // filter options / series.
  const needsBenchmarkData =
    activePage === 'benchmark' ||
    (activePage === 'coverage' && dataScope !== 'synthetic_distributional');
  const deriveBenchmarkData = activePage === 'benchmark';
  const {
    allData,
    data,
    seriesData,
    loading,
    error,
    filters,
    filterOptions,
    toggleFilter,
    clearFilters,
    clearWorkloadFilters,
  } = useData(dataScope, { deriveBenchmarkData, enabled: needsBenchmarkData });
  const { sweepState } = useSweepState();

  const setActivePage = useCallback((page: PageId) => {
    setActivePageState(page);
    window.history.replaceState(null, '', pageUrl(page));
  }, []);

  useEffect(() => {
    const onHashChange = () => {
      const nextPage = hashPage();
      if (nextPage) {
        setActivePageState(nextPage);
        return;
      }
      setActivePageState('benchmark');
      window.history.replaceState(null, '', pageUrl('benchmark'));
    };
    window.addEventListener('hashchange', onHashChange);
    onHashChange();
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const setDataScope = useCallback((scope: DataScope) => {
    window.localStorage.setItem(DATA_SCOPE_STORAGE_KEY, scope);
    const url = new URL(window.location.href);
    if (scope !== 'synthetic_distributional') {
      url.searchParams.set('scope', scope);
    } else {
      url.searchParams.delete('scope');
    }
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    startScopeTransition(() => {
      setDataScopeState(scope);
      clearWorkloadFilters();
    });
  }, [clearWorkloadFilters]);

  if (error && needsBenchmarkData) {
    return (
      <Layout
        totalRuns={0}
        loading={false}
        activePage={activePage}
        onPageChange={setActivePage}
        dataScope={dataScope}
        onDataScopeChange={setDataScope}
        scopePending={scopePending}
      >
        <div className="flex h-64 items-center justify-center rounded-[22px] border border-[#ff3b30]/20 bg-[#ff3b30]/[0.06] text-[#ff3b30]">
          <div className="text-center">
            <div className="mb-2 text-[17px] font-semibold tracking-tight">Failed to load data</div>
            <div className="text-[13px] text-[#c93400]">{error}</div>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout
      totalRuns={allData.length}
      loading={needsBenchmarkData ? loading : false}
      activePage={activePage}
      onPageChange={setActivePage}
      dataScope={dataScope}
      onDataScopeChange={setDataScope}
      scopePending={scopePending}
    >
      {INTERNAL && CoveragePage && activePage === 'coverage' ? (
        <Suspense
          fallback={
            <div className="flex h-64 items-center justify-center">
              <div className="text-[#a9afba]">Loading coverage...</div>
            </div>
          }
        >
          <CoveragePage
            allData={allData}
            sweepState={sweepState}
            loading={needsBenchmarkData ? loading : false}
            dataScope={dataScope}
          />
        </Suspense>
      ) : INTERNAL && GpuStatePage && activePage === 'gpu' ? (
        <Suspense
          fallback={
            <div className="flex h-64 items-center justify-center">
              <div className="text-[#a9afba]">Loading GPU state...</div>
            </div>
          }
        >
          <GpuStatePage />
        </Suspense>
      ) : INTERNAL && PredictionsMatrixPage && activePage === 'matrix' ? (
        <Suspense
          fallback={
            <div className="flex h-64 items-center justify-center">
              <div className="text-[#a9afba]">Loading predictions matrix...</div>
            </div>
          }
        >
          <PredictionsMatrixPage dataScope={dataScope} predictionsUrl={simulatorPredictionsJsonUrl} />
        </Suspense>
      ) : INTERNAL && ServingPredictionsPage && activePage === 'simulator_v2' ? (
        <Suspense
          fallback={
            <div className="flex h-64 items-center justify-center">
              <div className="text-[#a9afba]">Loading simulator...</div>
            </div>
          }
        >
          <ServingPredictionsPage
            dataScope="synthetic_distributional"
            predictionsUrl={simulatorV2SimPredictionsJsonUrl}
            pageKind="simulator"
          />
        </Suspense>
      ) : loading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="text-[#a9afba]">Loading benchmark data...</div>
        </div>
      ) : (
        <>
          <div className="animate-fade-up mb-10">
            <div className="eyebrow mb-4">
              <span className="text-[#2dd4bf]">◆</span> INFERENCE BENCHMARKS · REPRODUCIBLE · GROUND-TRUTH
            </div>
            <h1 className="text-[40px] font-semibold leading-[1.02] tracking-[-0.03em] text-[#f3f4f6] sm:text-[54px]">
              GPU inference,<br />
              <span className="text-grad">measured to the millisecond.</span>
            </h1>
            <p className="mt-5 max-w-[56ch] text-[16px] leading-relaxed text-[#a9afba]">
              Latency, throughput, and multi-turn behavior across real GPUs, models, and workloads —
              raw kernels up through the whole serving stack. No hand-waving, just ground truth.
            </p>
          </div>
          <KPICards data={data} allData={allData} />
          <Filters
            filters={filters}
            options={filterOptions}
            dataScope={dataScope}
            onToggle={toggleFilter}
            onClear={clearFilters}
          />
          <Tabs active={activeTab} onChange={setActiveTab} />

          {activeTab === 'latency' && <LatencyChart seriesData={seriesData} />}
          {activeTab === 'throughput' && <ThroughputChart seriesData={seriesData} />}
          {activeTab === 'comparison' && <ComparisonChart seriesData={seriesData} />}
          {activeTab === 'multi-turn' && <PerTurnChart data={data} />}
          {activeTab === 'raw' && <DataTable data={data} />}
        </>
      )}
    </Layout>
  );
}

export default App;
