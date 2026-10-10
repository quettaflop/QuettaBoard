export type SitePage = 'home' | 'efficiency' | 'blog';

export function readSitePage(): SitePage {
  if (typeof window === 'undefined') return 'home';
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  if (path.endsWith('/efficiency') || path.endsWith('/efficiency/index.html')) return 'efficiency';
  if (/\/blog(?:\/|$)/.test(path)) return 'blog';
  const hash = window.location.hash.replace(/^#\/?/, '');
  if (hash === 'efficiency') return 'efficiency';
  if (hash === 'blog' || hash.startsWith('blog/')) return 'blog';
  return 'home';
}

function isSiteHtml(): boolean {
  return typeof window !== 'undefined' && /site\.html$/.test(window.location.pathname);
}

export function sitePageHref(page: SitePage): string {
  if (page === 'home') return isSiteHtml() ? '/site.html' : '/';
  return isSiteHtml() ? `/site.html#${page}` : `/${page}/`;
}

export function siteContactHref(from: SitePage): string {
  return siteSectionHref('contact', from);
}

export function siteSectionHref(section: string, from: SitePage): string {
  return from === 'home' ? `#${section}` : `${sitePageHref('home')}#${section}`;
}

export function siteBlogHref(slug?: string): string {
  const base = sitePageHref('blog');
  return slug ? `${base}${isSiteHtml() ? '/' : ''}${slug}${isSiteHtml() ? '' : '/'}` : base;
}

export function readBlogSlug(): string | null {
  if (typeof window === 'undefined') return null;
  const path = isSiteHtml() ? window.location.hash.replace(/^#\/?/, '') : window.location.pathname;
  return path.match(/(?:^|\/)blog\/([a-z0-9-]+)(?:\/(?:index\.html)?)?$/)?.[1] ?? null;
}
