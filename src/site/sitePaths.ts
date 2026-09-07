export type SitePage = 'home' | 'efficiency';

export function readSitePage(): SitePage {
  if (typeof window === 'undefined') return 'home';
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  if (path.endsWith('/efficiency') || path.endsWith('/efficiency/index.html')) return 'efficiency';
  const hash = window.location.hash.replace(/^#\/?/, '');
  if (hash === 'efficiency') return 'efficiency';
  return 'home';
}

function isSiteHtml(): boolean {
  return typeof window !== 'undefined' && /site\.html$/.test(window.location.pathname);
}

export function sitePageHref(page: SitePage): string {
  if (page === 'home') return isSiteHtml() ? '/site.html' : '/';
  return isSiteHtml() ? '/site.html#efficiency' : '/efficiency/';
}

export function siteContactHref(from: SitePage): string {
  if (from === 'home') return '#contact';
  return isSiteHtml() ? '/site.html#contact' : '/#contact';
}
