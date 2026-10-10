import { useEffect, useState } from 'react';
import { Masthead } from './components/Masthead';
import { CardDeck } from './components/CardDeck';
import { EfficiencyIndex } from './components/EfficiencyIndex';
import { Footer } from './components/Footer';
import { Blog, BlogSection } from './components/Blog';
import { Careers } from './components/Careers';
import { POSTS } from './blog';
import { readBlogSlug, readSitePage, type SitePage } from './sitePaths';

export function App() {
  const [page, setPage] = useState<SitePage>(() => readSitePage());
  const [blogSlug, setBlogSlug] = useState(() => readBlogSlug());

  useEffect(() => {
    const sync = () => {
      setPage(readSitePage());
      setBlogSlug(readBlogSlug());
    };
    window.addEventListener('hashchange', sync);
    window.addEventListener('popstate', sync);
    return () => {
      window.removeEventListener('hashchange', sync);
      window.removeEventListener('popstate', sync);
    };
  }, []);

  useEffect(() => {
    const post = POSTS.find((p) => p.slug === blogSlug);
    document.title = page === 'efficiency' ? 'Efficiency Index — Quettaflop AI'
      : page === 'blog' ? `${blogSlug ? post?.title ?? 'Post not found' : 'Blog'} — Quettaflop AI`
      : page === 'careers' ? 'Careers — Quettaflop AI'
      : 'Quettaflop AI';
  }, [page, blogSlug]);

  return (
    <div className="min-h-screen">
      <a href="#main" className="skip-link">Skip to content</a>
      {page === 'efficiency' ? (
        <EfficiencyIndex />
      ) : page === 'blog' ? (
        <Blog slug={blogSlug} />
      ) : page === 'careers' ? (
        <Careers />
      ) : (
        <>
          <Masthead />
          <main id="main">
            <CardDeck />
            <BlogSection />
          </main>
        </>
      )}
      <Footer />
    </div>
  );
}
