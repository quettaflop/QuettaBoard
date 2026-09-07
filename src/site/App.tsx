import { useEffect, useState } from 'react';
import { Masthead } from './components/Masthead';
import { CardDeck } from './components/CardDeck';
import { CursorGlow } from './components/CursorGlow';
import { EfficiencyIndex } from './components/EfficiencyIndex';
import { Footer } from './components/Footer';
import { readSitePage, type SitePage } from './sitePaths';

export function App() {
  const [page, setPage] = useState<SitePage>(() => readSitePage());

  useEffect(() => {
    const sync = () => setPage(readSitePage());
    window.addEventListener('hashchange', sync);
    window.addEventListener('popstate', sync);
    return () => {
      window.removeEventListener('hashchange', sync);
      window.removeEventListener('popstate', sync);
    };
  }, []);

  useEffect(() => {
    document.title = page === 'efficiency' ? 'Efficiency Index — Quettaflop AI' : 'Quettaflop AI';
  }, [page]);

  return (
    <div className="min-h-screen">
      <CursorGlow />
      {page === 'efficiency' ? (
        <EfficiencyIndex />
      ) : (
        <>
          <Masthead />
          <main>
            <CardDeck />
          </main>
        </>
      )}
      <Footer />
    </div>
  );
}
