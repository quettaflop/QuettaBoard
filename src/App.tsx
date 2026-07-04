import { useCallback, useEffect, useState, useTransition } from 'react';
import { useData } from './hooks/useData';
import { Layout } from './components/Layout';
import { KPICards } from './components/KPICards';
import { Filters } from './components/Filters';
import { Tabs } from './components/Tabs';
import { LatencyChart } from './components/charts/LatencyChart';
import { ThroughputChart } from './components/charts/ThroughputChart';
import { ComparisonChart } from './components/charts/ComparisonChart';
import { PerTurnChart } from './components/charts/PerTurnChart';
import { DataTable } from './components/DataTable';
import { ServingPredictionsPage } from './components/ServingPredictionsPage';
import { simulatorV2SimPredictionsJsonUrl } from './dataUrls';
import type { TabId } from './types';
import { normalizeDataScope, type DataScope } from './profileMeta';
import './index.css';

type PageId = 'benchmark' | 'simulator';
const PAGE_IDS: PageId[] = ['benchmark', 'simulator'];
const DATA_SCOPE_STORAGE_KEY = 'inference-dashboard-data-scope';

function initialDataScope(): DataScope {
  const params = new URLSearchParams(window.location.search);
  const urlScope = params.get('scope');
  const normalizedUrlScope = normalizeDataScope(urlScope);
  if (normalizedUrlScope) return normalizedUrlScope;
  const storedScope = window.localStorage.getItem(DATA_SCOPE_STORAGE_KEY);
  return normalizeDataScope(storedScope) ?? 'trace_replay';
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
  const needsBenchmarkData = activePage === 'benchmark';
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
  } = useData(dataScope, { deriveBenchmarkData: needsBenchmarkData, enabled: needsBenchmarkData });

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
    if (scope !== 'trace_replay') {
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
        <div className="flex h-64 items-center justify-center rounded-2xl border border-[#ff3b30]/20 bg-[#ff3b30]/[0.06] text-[#ff3b30]">
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
      {activePage === 'simulator' ? (
        <>
          <div className="mb-8 flex items-start gap-3 rounded-2xl border border-[#ff9f0a]/25 bg-[#ff9f0a]/[0.06] px-5 py-4 text-[13px] leading-relaxed text-[#7a4a00] shadow-[0_2px_12px_rgba(0,0,0,0.03)]">
            <span className="mt-0.5 shrink-0 rounded-full bg-[#ff9f0a]/15 px-1.5 py-0.5 text-[9px] font-semibold tracking-wide text-[#9a5b00]">
              WIP
            </span>
            <span>
              The simulator is a work in progress. H100 and A100 Llama-3.1-8B deployments are
              calibrated against measured ground truth; other configurations are analytic
              first-cuts and should be read as rough estimates.
            </span>
          </div>
          <ServingPredictionsPage
            dataScope="synthetic_distributional"
            predictionsUrl={simulatorV2SimPredictionsJsonUrl}
            pageKind="simulator"
          />
        </>
      ) : loading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="text-[#6e6e73]">Loading benchmark data...</div>
        </div>
      ) : (
        <>
          <div className="animate-fade-up mb-10">
            <h1 className="text-[32px] font-semibold tracking-tight text-[#1d1d1f] sm:text-[36px]">
              Inference Benchmarks
            </h1>
            <p className="mt-2 text-[15px] text-[#6e6e73]">
              Latency, throughput, and multi-turn behavior across hardware, models, and workloads.
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
